'use client'

import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react'
import { Organization, UserOrgContext, UserRole } from '@/lib/types'
import { apiClient } from '@/lib/api'
import { useAuth } from './AuthContext'

interface OrgContextType {
    organizations: UserOrgContext[]
    allOrganizations: Organization[]
    currentOrg: UserOrgContext | null
    currentOrgRole: UserRole | null    // User's active role in the current org
    availableOrgRoles: UserRole[]      // All roles the user has in the current org
    isTenantAdmin: boolean             // Is the user a global tenant admin?
    isLoading: boolean
    error: string | null
    switchOrg: (orgId: string) => void
    switchOrgRole: (role: UserRole) => void
    loadMyOrgs: () => Promise<void>
    loadAllOrgs: () => Promise<void>
    createOrg: (name: string) => Promise<void>
    deleteOrg: (orgId: string) => Promise<void>
    clearError: () => void
}

const OrgContext = createContext<OrgContextType | undefined>(undefined)

export function OrgProvider({ children }: { children: ReactNode }) {
    const { user, isAuthenticated } = useAuth()
    const [organizations, setOrganizations] = useState<UserOrgContext[]>([])
    const [allOrganizations, setAllOrganizations] = useState<Organization[]>([])
    const [currentOrg, setCurrentOrg] = useState<UserOrgContext | null>(null)
    const [currentOrgRole, setCurrentOrgRole] = useState<UserRole | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Derive tenant admin status from global roles
    const isTenantAdmin = user?.roles?.includes('administrator') || false

    // Track whether initial org selection has been done
    const initialOrgSetRef = useRef(false)

    // Track whether the role was manually switched (prevent loadMyOrgs from overwriting it)
    const manualRoleOverrideRef = useRef(false)

    // Load the current user's organizations on auth
    const loadMyOrgs = useCallback(async () => {
        if (!isAuthenticated) return
        try {
            setIsLoading(true)
            setError(null)
            const orgs = await apiClient.getMyOrganizations()
            setOrganizations(orgs)

            // Only auto-select org on initial load, not on subsequent refreshes
            if (!initialOrgSetRef.current) {
                initialOrgSetRef.current = true
                const savedOrgId = localStorage.getItem('lr_current_org')
                const savedOrg = orgs.find(o => o.OrgId === savedOrgId)

                if (savedOrg) {
                    setCurrentOrg(savedOrg)
                    setCurrentOrgRole(savedOrg.EffectiveRole || null)
                } else if (orgs.length > 0) {
                    localStorage.setItem('lr_current_org', orgs[0].OrgId)
                    setCurrentOrg(orgs[0])
                    setCurrentOrgRole(orgs[0].EffectiveRole || null)
                }
            } else {
                // On refresh, update the currentOrg data if it still exists
                // but DON'T overwrite currentOrgRole if user manually switched roles
                setCurrentOrg(prev => {
                    if (prev) {
                        const updated = orgs.find(o => o.OrgId === prev.OrgId)
                        if (updated) {
                            if (!manualRoleOverrideRef.current) {
                                setCurrentOrgRole(updated.EffectiveRole || null)
                            }
                            return updated
                        }
                    }
                    return prev
                })
            }
        } catch (err: any) {
            console.warn('Failed to load user organizations:', err)
        } finally {
            setIsLoading(false)
        }
    }, [isAuthenticated])

    // Load all organizations (admin only)
    const loadAllOrgs = useCallback(async () => {
        try {
            setIsLoading(true)
            setError(null)
            const orgs = await apiClient.listOrganizations()
            setAllOrganizations(orgs)
        } catch (err: any) {
            setError(err.message || 'Failed to load organizations')
        } finally {
            setIsLoading(false)
        }
    }, [])

    // Switch active organization — resolves effective role
    const switchOrg = useCallback((orgId: string) => {
        // Clear manual role override when switching orgs
        manualRoleOverrideRef.current = false

        if (!orgId) {
            setCurrentOrg(null)
            setCurrentOrgRole(isTenantAdmin ? 'administrator' : null)
            localStorage.removeItem('lr_current_org')
            return
        }

        // First look in user's memberships (has EffectiveRole already)
        let org = organizations.find(o => o.OrgId === orgId)

        if (org) {
            setCurrentOrg(org)
            setCurrentOrgRole(org.EffectiveRole || null)
            localStorage.setItem('lr_current_org', orgId)
            return
        }

        // If not found in memberships and we have allOrgs (admin case)
        if (allOrganizations.length > 0) {
            const fullOrg = allOrganizations.find(o => o.Id === orgId)
            if (fullOrg) {
                org = {
                    OrgId: fullOrg.Id,
                    OrgName: fullOrg.Name,
                    Roles: ['administrator'],
                    EffectiveRole: 'administrator' as UserRole,
                }
                setCurrentOrg(org)
                setCurrentOrgRole('administrator')
                localStorage.setItem('lr_current_org', orgId)
                return
            }
        }

        // Fallback: fetch the role from backend
        apiClient.getMyOrgRole(orgId)
            .then(roleInfo => {
                setCurrentOrg({
                    OrgId: orgId,
                    OrgName: roleInfo.orgName,
                    Roles: roleInfo.rawRoles,
                    EffectiveRole: roleInfo.role,
                })
                setCurrentOrgRole(roleInfo.role)
                localStorage.setItem('lr_current_org', orgId)
            })
            .catch(() => {
                setCurrentOrg({ OrgId: orgId })
                setCurrentOrgRole(null)
                localStorage.setItem('lr_current_org', orgId)
            })
    }, [organizations, allOrganizations, isTenantAdmin])

    // Parse available roles from the current org's raw role names
    const availableOrgRoles: UserRole[] = (() => {
        if (!currentOrg?.Roles || currentOrg.Roles.length === 0) return []
        const knownSuffixes: UserRole[] = ['administrator', 'user', 'observer']
        const parsed: UserRole[] = []
        for (const rawRole of currentOrg.Roles) {
            const lower = rawRole.toLowerCase()
            for (const suffix of knownSuffixes) {
                if (lower.endsWith(`_${suffix}`) || lower === suffix) {
                    if (!parsed.includes(suffix)) parsed.push(suffix)
                }
            }
        }
        return parsed
    })()

    // Switch role within the current org (no org change)
    const switchOrgRole = useCallback((role: UserRole) => {
        if (availableOrgRoles.includes(role) || isTenantAdmin) {
            setCurrentOrgRole(role)
            manualRoleOverrideRef.current = true
        }
    }, [availableOrgRoles, isTenantAdmin])

    // Create a new organization
    const createOrg = useCallback(async (name: string) => {
        try {
            setIsLoading(true)
            setError(null)
            await apiClient.createOrganization(name)
            // Refresh lists
            await loadAllOrgs()
        } catch (err: any) {
            setError(err.message || 'Failed to create organization')
            throw err
        } finally {
            setIsLoading(false)
        }
    }, [loadAllOrgs])

    // Delete an organization
    const deleteOrg = useCallback(async (orgId: string) => {
        try {
            setIsLoading(true)
            setError(null)
            await apiClient.deleteOrganization(orgId)
            setAllOrganizations(prev => prev.filter(o => o.Id !== orgId))
            // If deleted the current org, clear it
            if (currentOrg?.OrgId === orgId) {
                setCurrentOrg(null)
                setCurrentOrgRole(null)
                localStorage.removeItem('lr_current_org')
            }
        } catch (err: any) {
            setError(err.message || 'Failed to delete organization')
            throw err
        } finally {
            setIsLoading(false)
        }
    }, [currentOrg])

    const clearError = useCallback(() => {
        setError(null)
    }, [])

    // Auto-load orgs when authenticated
    useEffect(() => {
        if (isAuthenticated && user) {
            loadMyOrgs()
        }
    }, [isAuthenticated, user])

    return (
        <OrgContext.Provider
            value={{
                organizations,
                allOrganizations,
                currentOrg,
                currentOrgRole,
                availableOrgRoles,
                isTenantAdmin,
                isLoading,
                error,
                switchOrg,
                switchOrgRole,
                loadMyOrgs,
                loadAllOrgs,
                createOrg,
                deleteOrg,
                clearError,
            }}
        >
            {children}
        </OrgContext.Provider>
    )
}

export function useOrg() {
    const context = useContext(OrgContext)
    if (!context) {
        throw new Error('useOrg must be used within OrgProvider')
    }
    return context
}
