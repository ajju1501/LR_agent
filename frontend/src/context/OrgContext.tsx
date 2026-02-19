'use client'

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react'
import { Organization, UserOrgContext } from '@/lib/types'
import { apiClient } from '@/lib/api'
import { useAuth } from './AuthContext'

interface OrgContextType {
    organizations: UserOrgContext[]
    allOrganizations: Organization[]
    currentOrg: UserOrgContext | null
    isLoading: boolean
    error: string | null
    switchOrg: (orgId: string) => void
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
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Load the current user's organizations on auth
    const loadMyOrgs = useCallback(async () => {
        if (!isAuthenticated) return
        try {
            setIsLoading(true)
            setError(null)
            const orgs = await apiClient.getMyOrganizations()
            setOrganizations(orgs)

            // Restore last selected org or pick first
            const savedOrgId = localStorage.getItem('lr_current_org')
            const savedOrg = orgs.find(o => o.OrgId === savedOrgId)

            setCurrentOrg(prev => {
                if (savedOrg) return savedOrg;
                if (orgs.length > 0 && !prev) {
                    localStorage.setItem('lr_current_org', orgs[0].OrgId)
                    return orgs[0]
                }
                return prev;
            });
        } catch (err: any) {
            console.warn('Failed to load user organizations:', err)
            // Don't set error - orgs might not be set up yet
        } finally {
            setIsLoading(false)
        }
    }, [isAuthenticated]) // Removed currentOrg dependency

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

    // Switch active organization
    const switchOrg = useCallback((orgId: string) => {
        if (!orgId) {
            setCurrentOrg(null)
            localStorage.removeItem('lr_current_org')
            return
        }

        // First look in memberships
        let org = organizations.find(o => o.OrgId === orgId)

        // If not found and we have allOrgs, look there (admin case)
        if (!org && allOrganizations.length > 0) {
            const fullOrg = allOrganizations.find(o => o.Id === orgId)
            if (fullOrg) {
                org = {
                    OrgId: fullOrg.Id,
                    OrgName: fullOrg.Name,
                    Roles: ['administrator'] // Assumed for admin viewing
                }
            }
        }

        if (org) {
            setCurrentOrg(org)
            localStorage.setItem('lr_current_org', orgId)
        }
    }, [organizations, allOrganizations])

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
                isLoading,
                error,
                switchOrg,
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
