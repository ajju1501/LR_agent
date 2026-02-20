'use client'

import { useOrg } from '@/context/OrgContext'
import { UserRole } from '@/lib/types'

export interface PagePermissions {
    // Tenant-level
    isTenantAdmin: boolean          // Global administrator (can manage everything)

    // Org-level
    currentOrgRole: UserRole | null // Role in currently selected org
    isOrgAdmin: boolean             // Is admin of current org
    isOrgUser: boolean              // Is user of current org
    isOrgObserver: boolean          // Is observer of current org
    hasOrgAccess: boolean           // Has any role in current org

    // Feature flags
    canManageOrgs: boolean          // Create/delete orgs (tenant admin only)
    canManageDocuments: boolean     // Upload/delete docs (tenant admin or org admin)
    canManageUsers: boolean         // Assign roles (tenant admin or org admin)
    canChat: boolean                // Use chatbot (admin or user)
    canViewDashboard: boolean       // View analytics (any role)
    canViewDocuments: boolean       // View documents read-only (any role)
}

export function usePagePermissions(): PagePermissions {
    const { currentOrgRole, isTenantAdmin } = useOrg()

    const isOrgAdmin = currentOrgRole === 'administrator'
    const isOrgUser = currentOrgRole === 'user'
    const isOrgObserver = currentOrgRole === 'observer'
    const hasOrgAccess = currentOrgRole !== null

    return {
        // Tenant-level
        isTenantAdmin,

        // Org-level
        currentOrgRole,
        isOrgAdmin,
        isOrgUser,
        isOrgObserver,
        hasOrgAccess,

        // Feature flags
        canManageOrgs: isTenantAdmin,
        canManageDocuments: isTenantAdmin || isOrgAdmin,
        canManageUsers: isTenantAdmin || isOrgAdmin,
        canChat: isTenantAdmin || isOrgAdmin || isOrgUser,
        canViewDashboard: isTenantAdmin || isOrgAdmin || isOrgUser || isOrgObserver,
        canViewDocuments: isTenantAdmin || isOrgAdmin || isOrgUser || isOrgObserver,
    }
}
