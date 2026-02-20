# Implementation Plan: Tenant-Aware Admin with Org-Level Role-Based Access

## Summary

Transform the current admin page from a **global-admin-only** page into a **tenant-aware, role-based** page where:
- **Tenant** (current `administrator` role holder) = super-admin, can create/delete orgs, manage everything
- **Org Admin** (e.g., `testlr1_administrator`) = admin for that specific org only
- **Normal User/Observer** = read-only or restricted view per org

The key insight: roles are **already assigned in the LoginRadius tenant account** at the org level. We just need to **fetch them** via `getUserOrgContext` and use the `Roles[]` array per org to drive the UI.

---

## Current Architecture Analysis

### What We Have
| Layer | Component | Current Behavior |
|-------|-----------|-----------------|
| **Backend** | `loginRadiusService.getUserOrgContext(uid)` | Returns `LRUserOrgContext[]` with `{ OrgId, OrgName, Roles[] }` per org |
| **Backend** | `loginRadiusService.getOrgRoles(orgId)` | Returns available roles for an org |
| **Backend** | `auth.ts` middleware | Fetches global roles + org context, but **only uses global roles** for authorization |
| **Backend** | `orgRoutes.ts` | All CRUD locked behind `requireRole('administrator')` — global admin only |
| **Frontend** | `OrgContext.tsx` | `organizations[]` has `UserOrgContext` (includes `Roles[]`), but `switchOrg` **ignores roles** |
| **Frontend** | `AuthContext.tsx` | Only stores **global roles** in `user.roles` |
| **Frontend** | `RouteGuard.tsx` | Only checks **global roles** |
| **Frontend** | `admin/page.tsx` | Renders everything for `administrator` role, no per-org access levels |
| **Frontend** | `Sidebar.tsx` | Uses `isAdmin` based on global role only |

### What LoginRadius Provides
- `GET /v2/manage/account/:uid/orgcontext` → returns `[{ OrgId, Roles: ['testlr1_administrator'] }]`
- Each org has its own roles (e.g., `testlr1_administrator`, `testlr1_user`, `testlr1_observer`)
- The naming convention: `{orgName}_{roleSuffix}` where `roleSuffix` ∈ `{administrator, user, observer}`

---

## Implementation Plan

### Phase 1: Backend — Add Org-Aware Role Resolution

#### 1.1 Add `getEffectiveOrgRole` utility to `loginRadiusService.ts`

**File:** `backend/src/services/loginRadiusService.ts`

Add a method that, given a user's org context and a target orgId, resolves the **effective role** for that org:

```typescript
/**
 * Resolve the user's effective role for a specific organization.
 * Convention: roles are named {orgName}_{roleSuffix}
 * e.g., "testlr1_administrator", "testlr1_user", "testlr1_observer"
 * 
 * Returns: 'administrator' | 'user' | 'observer' | null
 */
getEffectiveOrgRole(orgRoles: string[], orgName: string): UserRole | null {
    const normalizedOrgName = orgName.toLowerCase().replace(/\s+/g, '');
    
    const roleSuffixes: UserRole[] = ['administrator', 'user', 'observer'];
    
    for (const suffix of roleSuffixes) {
        const expectedRole = `${normalizedOrgName}_${suffix}`;
        if (orgRoles.some(r => r.toLowerCase() === expectedRole.toLowerCase())) {
            return suffix;
        }
    }
    
    // Fallback: check if any role contains the suffix directly
    for (const suffix of roleSuffixes) {
        if (orgRoles.some(r => r.toLowerCase().includes(suffix))) {
            return suffix;
        }
    }
    
    return null;
}
```

**Why:** This decouples the org role name format (`testlr1_administrator`) from the application role concept (`administrator`). We parse the convention-based role name to extract the logical role.

#### 1.2 Create new backend endpoint: `GET /api/orgs/my-org-role/:orgId`

**File:** `backend/src/controllers/orgController.ts`

```typescript
/**
 * GET /api/orgs/my-org-role/:orgId
 * Returns the current user's effective role for a specific org
 */
export async function getMyOrgRole(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
        if (!req.user) {
            return res.status(401).json({ status: 'error', message: 'Not authenticated' });
        }

        const { orgId } = req.params;
        const contexts = await loginRadiusService.getUserOrgContext(req.user.uid);
        const orgCtx = contexts.find(c => c.OrgId === orgId);
        
        if (!orgCtx) {
            return res.json({ 
                status: 'success', 
                data: { orgId, role: null, isMember: false } 
            });
        }

        // Get org details for the name
        const org = await loginRadiusService.getOrganization(orgId);
        const effectiveRole = loginRadiusService.getEffectiveOrgRole(
            orgCtx.Roles || [], 
            org.Name
        );

        res.json({
            status: 'success',
            data: { 
                orgId, 
                orgName: org.Name,
                role: effectiveRole, 
                rawRoles: orgCtx.Roles,
                isMember: true 
            }
        });
    } catch (error: any) {
        logger.error('Failed to get user org role', { error: error.message });
        res.status(500).json({ status: 'error', message: error.message });
    }
}
```

**File:** `backend/src/routes/orgRoutes.ts`

Add a new route (any authenticated user can check their own role):
```typescript
router.get('/my-org-role/:orgId', requireAuth, orgController.getMyOrgRole);
```

> **Important:** Place this route **before** the `/:orgId` catch-all route.

#### 1.3 Enrich `getUserOrgContext` response with effective roles

**File:** `backend/src/services/loginRadiusService.ts`

Modify `getUserOrgContext` to also return the parsed effective role:

```typescript
// In the normalization step, add:
const effectiveRole = this.getEffectiveOrgRole(
    ctx.Roles || [], 
    normalized.OrgName || ''
);

return {
    ...normalized,
    EffectiveRole: effectiveRole, // 'administrator' | 'user' | 'observer' | null
};
```

#### 1.4 Update auth middleware to carry org-level role

**File:** `backend/src/middleware/auth.ts`

In the `AuthenticatedRequest` interface, add:
```typescript
orgRole?: UserRole; // The user's role in the active organization
```

And in `requireAuth`, after org verification:
```typescript
if (activeOrgId) {
    const orgCtx = orgContexts.find(ctx => ctx.OrgId === activeOrgId);
    if (orgCtx) {
        const org = await loginRadiusService.getOrganization(activeOrgId);
        const effectiveRole = loginRadiusService.getEffectiveOrgRole(
            orgCtx.Roles || [], org.Name
        );
        req.user.orgRole = effectiveRole || undefined;
    }
}
```

---

### Phase 2: Frontend — Types & API Client

#### 2.1 Update Types

**File:** `frontend/src/lib/types.ts`

```typescript
// Add EffectiveRole to UserOrgContext
export interface UserOrgContext {
  OrgId: string;
  OrgName?: string;
  Roles?: string[];       // Raw roles from LR (e.g., ['testlr1_administrator'])
  EffectiveRole?: UserRole; // Parsed role ('administrator' | 'user' | 'observer')
  [key: string]: any;
}
```

#### 2.2 Add API method

**File:** `frontend/src/lib/api.ts`

```typescript
async getMyOrgRole(orgId: string): Promise<{ orgId: string; role: UserRole | null; isMember: boolean; rawRoles: string[] }> {
    const response = await this.client.get<{ status: string; data: any }>(`/api/orgs/my-org-role/${orgId}`);
    return response.data.data;
}
```

---

### Phase 3: Frontend — OrgContext Enhancement

#### 3.1 Add `currentOrgRole` to OrgContext

**File:** `frontend/src/context/OrgContext.tsx`

This is the central piece. When the user switches org, we need to know their role in that org.

```typescript
interface OrgContextType {
    // ... existing fields ...
    currentOrgRole: UserRole | null;  // NEW: user's effective role in current org
    isTenantAdmin: boolean;           // NEW: is the user a global tenant admin?
}
```

**Update `OrgProvider`:**

```typescript
const [currentOrgRole, setCurrentOrgRole] = useState<UserRole | null>(null);

// Derive tenant admin from global roles
const isTenantAdmin = user?.roles?.includes('administrator') || false;
```

**Update `switchOrg`:**
```typescript
const switchOrg = useCallback(async (orgId: string) => {
    if (!orgId) {
        setCurrentOrg(null);
        setCurrentOrgRole(isTenantAdmin ? 'administrator' : null);
        localStorage.removeItem('lr_current_org');
        return;
    }

    // Look in user's memberships first
    let org = organizations.find(o => o.OrgId === orgId);

    if (org) {
        setCurrentOrg(org);
        // Derive role from the org context
        setCurrentOrgRole(org.EffectiveRole || null);
    } else if (allOrganizations.length > 0) {
        // Admin viewing an org they're not a member of
        const fullOrg = allOrganizations.find(o => o.Id === orgId);
        if (fullOrg) {
            org = {
                OrgId: fullOrg.Id,
                OrgName: fullOrg.Name,
                Roles: ['administrator'],
                EffectiveRole: 'administrator' as UserRole,
            };
            setCurrentOrg(org);
            setCurrentOrgRole('administrator');
        }
    }

    if (orgId) {
        localStorage.setItem('lr_current_org', orgId);
    }
    
    // For non-tenant-admins, fetch their actual org role
    if (!isTenantAdmin && orgId) {
        try {
            const roleData = await apiClient.getMyOrgRole(orgId);
            setCurrentOrgRole(roleData.role);
        } catch {
            setCurrentOrgRole(null);
        }
    }
}, [organizations, allOrganizations, isTenantAdmin]);
```

**Update `loadMyOrgs`:**

The `EffectiveRole` is now returned from the backend's enriched `getUserOrgContext`, so no extra calls needed.

---

### Phase 4: Frontend — Admin Page Transformation

#### 4.1 Rename Concepts

| Before | After |
|--------|-------|
| "Admin Panel" (only for global admins) | "Management Panel" (accessible by org admins too) |
| `RouteGuard allowedRoles={['administrator']}` | Custom guard that checks global OR org-level admin |

#### 4.2 Create a `usePagePermissions` hook

**File:** `frontend/src/hooks/usePagePermissions.ts` (NEW)

```typescript
import { useAuth } from '@/context/AuthContext';
import { useOrg } from '@/context/OrgContext';
import { UserRole } from '@/lib/types';

export interface PagePermissions {
    // Tenant-level
    isTenantAdmin: boolean;      // Global administrator
    
    // Org-level
    currentOrgRole: UserRole | null;  // Role in currently selected org
    isOrgAdmin: boolean;          // Is admin of current org
    isOrgUser: boolean;           // Is user of current org
    isOrgObserver: boolean;       // Is observer of current org
    
    // Feature flags
    canManageOrgs: boolean;       // Create/delete orgs (tenant admin only)
    canManageDocuments: boolean;  // Upload/delete docs (tenant admin or org admin)
    canManageUsers: boolean;      // Assign roles (tenant admin or org admin)
    canChat: boolean;             // Use chatbot (admin or user)
    canViewDashboard: boolean;    // View analytics (any role)
}

export function usePagePermissions(): PagePermissions {
    const { user } = useAuth();
    const { currentOrgRole } = useOrg();
    
    const isTenantAdmin = user?.roles?.includes('administrator') || false;
    const isOrgAdmin = currentOrgRole === 'administrator';
    const isOrgUser = currentOrgRole === 'user';
    const isOrgObserver = currentOrgRole === 'observer';
    
    return {
        isTenantAdmin,
        currentOrgRole,
        isOrgAdmin,
        isOrgUser,
        isOrgObserver,
        
        canManageOrgs: isTenantAdmin,
        canManageDocuments: isTenantAdmin || isOrgAdmin,
        canManageUsers: isTenantAdmin || isOrgAdmin,
        canChat: isTenantAdmin || isOrgAdmin || isOrgUser,
        canViewDashboard: isTenantAdmin || isOrgAdmin || isOrgUser || isOrgObserver,
    };
}
```

#### 4.3 Refactor Admin Page with Role-Based Rendering

**File:** `frontend/src/app/admin/page.tsx`

**Key changes:**

1. **Remove** `RouteGuard allowedRoles={['administrator']}` — instead, allow any authenticated user but conditionally render sections

2. **Add dynamic sidebar navigation** based on permissions:

```tsx
function AdminPage() {
    const { user, logout } = useAuth();
    const { currentOrg, switchOrg, allOrganizations, organizations, loadAllOrgs, loadMyOrgs, currentOrgRole, isTenantAdmin } = useOrg();
    const perms = usePagePermissions();
    
    // Determine which tabs to show
    const tabs = [
        // Tenant admin always sees this
        perms.canManageOrgs && { id: 'organizations', label: 'Organizations', icon: Building2 },
        // Admin (tenant or org) sees these
        perms.canChat && { id: 'chat', label: 'Chatbot', icon: MessageSquare },
        perms.canManageDocuments && { id: 'documents', label: 'Documents', icon: FolderOpen },
        perms.canManageUsers && { id: 'users', label: 'User Management', icon: Users },
        // Observer sees dashboard only
        perms.canViewDashboard && { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
    ].filter(Boolean);
    
    const [activeTab, setActiveTab] = useState(tabs[0]?.id || 'chat');
    
    // ...render based on activeTab
}
```

3. **Show role badge in sidebar:**

```tsx
{/* Active Org Role Indicator */}
{currentOrg && (
    <div className="px-5 py-2 border-b border-white/5">
        <div className="flex items-center gap-2">
            <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider
                ${perms.isOrgAdmin ? 'bg-purple-500/20 text-purple-300' : 
                  perms.isOrgUser ? 'bg-blue-500/20 text-blue-300' : 
                  'bg-gray-500/20 text-gray-300'}`}>
                {currentOrgRole || 'No Access'}
            </span>
            <span className="text-[10px] text-purple-200/40">in {currentOrg.OrgName}</span>
        </div>
    </div>
)}
```

4. **Organization dropdown behavior changes:**
   - **Tenant admin:** Sees ALL organizations (from `loadAllOrgs`)
   - **Non-tenant admin:** Sees only THEIR organizations (from `loadMyOrgs` / `organizations[]`)
   - When org is switched, `currentOrgRole` auto-updates

5. **Tab content rendering with permission checks:**

```tsx
{activeTab === 'documents' && perms.canManageDocuments && <DocumentsPanel />}
{activeTab === 'documents' && !perms.canManageDocuments && <ReadOnlyDocumentsPanel />}

{activeTab === 'users' && perms.canManageUsers && <UsersPanel />}
{activeTab === 'users' && !perms.canManageUsers && <AccessDeniedMessage />}

{activeTab === 'organizations' && perms.canManageOrgs && <OrganizationsPanel />}
{activeTab === 'organizations' && !perms.canManageOrgs && <OrgInfoPanel />}
```

#### 4.4 Update `RouteGuard` or Create New Guard

**File:** `frontend/src/components/RouteGuard.tsx`

Option A: Extend `RouteGuard` to accept org-level roles:
```tsx
interface RouteGuardProps {
    children: React.ReactNode;
    allowedRoles?: UserRole[];          // Global roles
    allowedOrgRoles?: UserRole[];       // Org-level roles (OR condition)
    requireAny?: boolean;               // If true, either global OR org role is enough
}
```

Option B (Recommended): Replace the admin page's `RouteGuard` with a simpler auth check:
```tsx
export default function AdminDashboard() {
    return (
        <RouteGuard allowedRoles={['administrator', 'user', 'observer']}>
            <AdminPage />
        </RouteGuard>
    )
}
```

The admin page itself handles what to show/hide based on `usePagePermissions()`.

---

### Phase 5: Frontend — Sidebar Updates

#### 5.1 Update Sidebar to Reflect Org Role

**File:** `frontend/src/components/Sidebar.tsx`

```tsx
// Replace the simple isAdmin check
const { currentOrgRole, isTenantAdmin } = useOrg();
const isAdmin = isTenantAdmin || currentOrgRole === 'administrator';

// Show "Admin Panel" link if user is admin of ANY org
const showAdminLink = isTenantAdmin || organizations.some(o => 
    o.EffectiveRole === 'administrator'
);
```

---

### Phase 6: Backend Route Protection Updates

#### 6.1 Add Org-Aware Middleware

**File:** `backend/src/middleware/auth.ts`

```typescript
/**
 * Middleware that allows access if the user has the required role
 * either globally (tenant-level) OR within the active organization.
 */
export function requireOrgRole(...allowedRoles: UserRole[]) {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        if (!req.user) {
            return res.status(401).json({ status: 'error', message: 'Not authenticated' });
        }

        // Global admin always passes
        if (req.user.roles.includes('administrator')) {
            return next();
        }

        // Check org-level role
        if (req.user.orgRole && allowedRoles.includes(req.user.orgRole)) {
            return next();
        }

        return res.status(403).json({
            status: 'error',
            message: `Access denied. Required role: ${allowedRoles.join(' or ')} (global or org-level)`,
        });
    };
}
```

#### 6.2 Update Protected Routes

**File:** `backend/src/routes/orgRoutes.ts`

```typescript
// Keep tenant-admin-only routes
router.post('/', requireAuth, requireRole('administrator'), orgController.createOrganization);
router.delete('/:orgId', requireAuth, requireRole('administrator'), orgController.deleteOrganization);

// Allow org admins to view their org details
router.get('/:orgId', requireAuth, requireOrgRole('administrator'), orgController.getOrganization);
router.get('/:orgId/roles', requireAuth, requireOrgRole('administrator'), orgController.getOrgRoles);
```

Similarly update document routes and user management routes to use `requireOrgRole`.

---

## File Change Summary

| File | Action | Summary |
|------|--------|---------|
| `backend/src/services/loginRadiusService.ts` | MODIFY | Add `getEffectiveOrgRole()`, enrich `getUserOrgContext()` |
| `backend/src/controllers/orgController.ts` | MODIFY | Add `getMyOrgRole` endpoint |
| `backend/src/routes/orgRoutes.ts` | MODIFY | Add `/my-org-role/:orgId` route, update route permissions |
| `backend/src/middleware/auth.ts` | MODIFY | Add `orgRole` to request, add `requireOrgRole` middleware |
| `frontend/src/lib/types.ts` | MODIFY | Add `EffectiveRole` to `UserOrgContext` |
| `frontend/src/lib/api.ts` | MODIFY | Add `getMyOrgRole()` method |
| `frontend/src/context/OrgContext.tsx` | MODIFY | Add `currentOrgRole`, `isTenantAdmin`, update `switchOrg` |
| `frontend/src/hooks/usePagePermissions.ts` | CREATE | Centralized permission hook |
| `frontend/src/app/admin/page.tsx` | MODIFY | Major refactor for role-based rendering |
| `frontend/src/components/RouteGuard.tsx` | MODIFY | Support org-level roles |
| `frontend/src/components/Sidebar.tsx` | MODIFY | Use org-level role for admin link |

---

## Data Flow Diagram

```
User logs in
    │
    ├── AuthContext stores global roles (e.g., ['user'])
    │
    ├── OrgContext.loadMyOrgs()
    │       └── GET /api/orgs/my-orgs
    │           └── Returns [{ OrgId, OrgName, Roles: ['testlr1_administrator'], EffectiveRole: 'administrator' }]
    │
    └── User selects org "testlr1"
            │
            ├── OrgContext.switchOrg('orgId123')
            │       └── Sets currentOrgRole = 'administrator' (from EffectiveRole)
            │
            └── Admin Page re-renders
                    │
                    ├── usePagePermissions() → { isOrgAdmin: true, canManageDocuments: true, ... }
                    │
                    └── Shows: Documents ✅, Users ✅, Chat ✅
                    
            User switches to org "testlr2" (where they are 'observer')
                    │
                    ├── currentOrgRole = 'observer'
                    │
                    └── usePagePermissions() → { isOrgObserver: true, canManageDocuments: false, ... }
                    │
                    └── Shows: Dashboard ✅, Documents ❌, Users ❌
```

---

## Implementation Order

1. **Phase 1.1** — Add `getEffectiveOrgRole` to backend service (quick, no breaking changes)
2. **Phase 1.3** — Enrich `getUserOrgContext` response (backend enriches data)
3. **Phase 2.1** — Update frontend types
4. **Phase 2.2** — Add `getMyOrgRole` API method
5. **Phase 1.2** — Add `/my-org-role/:orgId` backend endpoint + route
6. **Phase 3.1** — Update OrgContext with `currentOrgRole` + `isTenantAdmin`
7. **Phase 4.2** — Create `usePagePermissions` hook
8. **Phase 4.3** — Refactor admin page (the big UI change)
9. **Phase 4.4** — Update RouteGuard
10. **Phase 5.1** — Update Sidebar
11. **Phase 1.4 + 6.1 + 6.2** — Backend middleware + route protection updates (can run in parallel)

---

## Testing Checklist

- [ ] Tenant admin can see all orgs, create/delete orgs, manage all
- [ ] Org admin (e.g., `testlr1_administrator`) can see only their orgs + full admin for their org
- [ ] Org user can only chat, view their org's dashboard
- [ ] Org observer can only view dashboard
- [ ] Switching orgs updates the UI instantly (no page reload)
- [ ] Non-member of an org sees restricted view
- [ ] Backend rejects unauthorized org-level operations
