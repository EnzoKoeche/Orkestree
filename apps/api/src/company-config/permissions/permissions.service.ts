import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuditOperation } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigAuditService } from '../audit/config-audit.service';
import {
    SetRoleFieldPermissionDto,
    SetUserFieldPermissionOverrideDto,
} from './dto/set-field-permission.dto';
import { SetRolePermissionDto } from './dto/set-role-permission.dto';
import { SetUserPermissionOverrideDto } from './dto/set-user-permission-override.dto';

@Injectable()
export class PermissionsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly auditService: ConfigAuditService,
        private readonly events: EventEmitter2,
    ) { }

    // ── Role Permissions ─────────────────────────────────────────────────────

    async setRolePermission(companyId: string, actorId: string, dto: SetRolePermissionDto) {
        const result = await this.prisma.$transaction(async (tx) => {
            const existing = await tx.rolePermission.findUnique({
                where: {
                    companyId_role_resource_action: {
                        companyId,
                        role: dto.role,
                        resource: dto.resource,
                        action: dto.action,
                    },
                },
                select: { id: true, allowed: true },
            });

            const record = await tx.rolePermission.upsert({
                where: {
                    companyId_role_resource_action: {
                        companyId,
                        role: dto.role,
                        resource: dto.resource,
                        action: dto.action,
                    },
                },
                create: { companyId, role: dto.role, resource: dto.resource, action: dto.action, allowed: dto.allowed },
                update: { allowed: dto.allowed },
            });

            await this.auditService.write(tx, {
                companyId,
                actorId,
                operation: existing ? AuditOperation.UPDATE : AuditOperation.CREATE,
                entityType: 'RolePermission',
                entityId: record.id,
                before: existing
                    ? { role: dto.role, resource: dto.resource, action: dto.action, allowed: existing.allowed }
                    : undefined,
                after: { role: dto.role, resource: dto.resource, action: dto.action, allowed: dto.allowed },
            });

            return record;
        });

        this.events.emit('config.permission.changed', { companyId });
        return result;
    }

    async getRolePermissions(companyId: string) {
        return this.prisma.rolePermission.findMany({
            where: { companyId },
            select: { id: true, role: true, resource: true, action: true, allowed: true, createdAt: true, updatedAt: true },
            orderBy: [{ role: 'asc' }, { resource: 'asc' }, { action: 'asc' }],
        });
    }

    async deleteRolePermission(companyId: string, id: string, actorId: string) {
        await this.prisma.$transaction(async (tx) => {
            const existing = await tx.rolePermission.findFirst({
                where: { id, companyId },
                select: { id: true, role: true, resource: true, action: true, allowed: true },
            });
            if (!existing) throw new NotFoundException('Role permission override not found.');

            await tx.rolePermission.delete({ where: { id } });

            await this.auditService.write(tx, {
                companyId,
                actorId,
                operation: AuditOperation.DELETE,
                entityType: 'RolePermission',
                entityId: id,
                before: { role: existing.role, resource: existing.resource, action: existing.action, allowed: existing.allowed },
            });
        });

        this.events.emit('config.permission.changed', { companyId });
    }

    // ── User Permission Overrides ─────────────────────────────────────────────

    async setUserPermissionOverride(companyId: string, actorId: string, dto: SetUserPermissionOverrideDto) {
        const result = await this.prisma.$transaction(async (tx) => {
            // Verify the membership belongs to the target company to prevent cross-tenant injection.
            const membership = await tx.companyMembership.findFirst({
                where: { id: dto.membershipId, companyId },
                select: { id: true },
            });
            if (!membership) throw new NotFoundException('Membership not found in this company.');

            const existing = await tx.userPermissionOverride.findUnique({
                where: {
                    companyId_membershipId_resource_action: {
                        companyId,
                        membershipId: dto.membershipId,
                        resource: dto.resource,
                        action: dto.action,
                    },
                },
                select: { id: true, allowed: true },
            });

            const record = await tx.userPermissionOverride.upsert({
                where: {
                    companyId_membershipId_resource_action: {
                        companyId,
                        membershipId: dto.membershipId,
                        resource: dto.resource,
                        action: dto.action,
                    },
                },
                create: { companyId, membershipId: dto.membershipId, resource: dto.resource, action: dto.action, allowed: dto.allowed },
                update: { allowed: dto.allowed },
            });

            await this.auditService.write(tx, {
                companyId,
                actorId,
                operation: existing ? AuditOperation.UPDATE : AuditOperation.CREATE,
                entityType: 'UserPermissionOverride',
                entityId: record.id,
                before: existing
                    ? { membershipId: dto.membershipId, resource: dto.resource, action: dto.action, allowed: existing.allowed }
                    : undefined,
                after: { membershipId: dto.membershipId, resource: dto.resource, action: dto.action, allowed: dto.allowed },
            });

            return record;
        });

        this.events.emit('config.permission.changed', { companyId, membershipId: dto.membershipId });
        return result;
    }

    async getUserPermissionOverrides(companyId: string, membershipId: string) {
        if (!membershipId) throw new BadRequestException('membershipId query parameter is required.');
        const membershipExists = await this.prisma.companyMembership.findFirst({
            where: { id: membershipId, companyId },
            select: { id: true },
        });
        if (!membershipExists) throw new NotFoundException('Membership not found in this company.');
        return this.prisma.userPermissionOverride.findMany({
            where: { companyId, membershipId },
            select: { id: true, membershipId: true, resource: true, action: true, allowed: true, createdAt: true, updatedAt: true },
            orderBy: [{ resource: 'asc' }, { action: 'asc' }],
        });
    }

    async deleteUserPermissionOverride(companyId: string, id: string, actorId: string) {
        const { membershipId } = await this.prisma.$transaction(async (tx) => {
            const existing = await tx.userPermissionOverride.findFirst({
                where: { id, companyId },
                select: { membershipId: true, resource: true, action: true, allowed: true },
            });
            if (!existing) throw new NotFoundException('User permission override not found.');

            await tx.userPermissionOverride.delete({ where: { id } });

            await this.auditService.write(tx, {
                companyId,
                actorId,
                operation: AuditOperation.DELETE,
                entityType: 'UserPermissionOverride',
                entityId: id,
                before: { membershipId: existing.membershipId, resource: existing.resource, action: existing.action, allowed: existing.allowed },
            });

            return { membershipId: existing.membershipId };
        });

        this.events.emit('config.permission.changed', { companyId, membershipId });
    }

    // ── Role Field Permissions ────────────────────────────────────────────────

    async setRoleFieldPermission(companyId: string, actorId: string, dto: SetRoleFieldPermissionDto) {
        const result = await this.prisma.$transaction(async (tx) => {
            const existing = await tx.roleFieldPermission.findUnique({
                where: { companyId_role_field: { companyId, role: dto.role, field: dto.field } },
                select: { id: true, allowed: true },
            });

            const record = await tx.roleFieldPermission.upsert({
                where: { companyId_role_field: { companyId, role: dto.role, field: dto.field } },
                create: { companyId, role: dto.role, field: dto.field, allowed: dto.allowed },
                update: { allowed: dto.allowed },
            });

            await this.auditService.write(tx, {
                companyId,
                actorId,
                operation: existing ? AuditOperation.UPDATE : AuditOperation.CREATE,
                entityType: 'RoleFieldPermission',
                entityId: record.id,
                before: existing ? { role: dto.role, field: dto.field, allowed: existing.allowed } : undefined,
                after: { role: dto.role, field: dto.field, allowed: dto.allowed },
            });

            return record;
        });

        this.events.emit('config.permission.changed', { companyId });
        return result;
    }

    async getRoleFieldPermissions(companyId: string) {
        return this.prisma.roleFieldPermission.findMany({
            where: { companyId },
            select: { id: true, role: true, field: true, allowed: true, createdAt: true, updatedAt: true },
            orderBy: [{ role: 'asc' }, { field: 'asc' }],
        });
    }

    async deleteRoleFieldPermission(companyId: string, id: string, actorId: string) {
        await this.prisma.$transaction(async (tx) => {
            const existing = await tx.roleFieldPermission.findFirst({
                where: { id, companyId },
                select: { id: true, role: true, field: true, allowed: true },
            });
            if (!existing) throw new NotFoundException('Role field permission override not found.');

            await tx.roleFieldPermission.delete({ where: { id } });

            await this.auditService.write(tx, {
                companyId,
                actorId,
                operation: AuditOperation.DELETE,
                entityType: 'RoleFieldPermission',
                entityId: id,
                before: { role: existing.role, field: existing.field, allowed: existing.allowed },
            });
        });

        this.events.emit('config.permission.changed', { companyId });
    }

    // ── User Field Permission Overrides ───────────────────────────────────────

    async setUserFieldPermissionOverride(
        companyId: string,
        actorId: string,
        dto: SetUserFieldPermissionOverrideDto,
    ) {
        const result = await this.prisma.$transaction(async (tx) => {
            // Verify the membership belongs to the target company to prevent cross-tenant injection.
            const membership = await tx.companyMembership.findFirst({
                where: { id: dto.membershipId, companyId },
                select: { id: true },
            });
            if (!membership) throw new NotFoundException('Membership not found in this company.');

            const existing = await tx.userFieldPermissionOverride.findUnique({
                where: {
                    companyId_membershipId_field: {
                        companyId,
                        membershipId: dto.membershipId,
                        field: dto.field,
                    },
                },
                select: { id: true, allowed: true },
            });

            const record = await tx.userFieldPermissionOverride.upsert({
                where: {
                    companyId_membershipId_field: {
                        companyId,
                        membershipId: dto.membershipId,
                        field: dto.field,
                    },
                },
                create: { companyId, membershipId: dto.membershipId, field: dto.field, allowed: dto.allowed },
                update: { allowed: dto.allowed },
            });

            await this.auditService.write(tx, {
                companyId,
                actorId,
                operation: existing ? AuditOperation.UPDATE : AuditOperation.CREATE,
                entityType: 'UserFieldPermissionOverride',
                entityId: record.id,
                before: existing
                    ? { membershipId: dto.membershipId, field: dto.field, allowed: existing.allowed }
                    : undefined,
                after: { membershipId: dto.membershipId, field: dto.field, allowed: dto.allowed },
            });

            return record;
        });

        this.events.emit('config.permission.changed', { companyId, membershipId: dto.membershipId });
        return result;
    }

    async getUserFieldPermissionOverrides(companyId: string, membershipId: string) {
        if (!membershipId) throw new BadRequestException('membershipId query parameter is required.');
        const membershipExists = await this.prisma.companyMembership.findFirst({
            where: { id: membershipId, companyId },
            select: { id: true },
        });
        if (!membershipExists) throw new NotFoundException('Membership not found in this company.');
        return this.prisma.userFieldPermissionOverride.findMany({
            where: { companyId, membershipId },
            select: { id: true, membershipId: true, field: true, allowed: true, createdAt: true, updatedAt: true },
            orderBy: [{ field: 'asc' }],
        });
    }

    async deleteUserFieldPermissionOverride(companyId: string, id: string, actorId: string) {
        const { membershipId } = await this.prisma.$transaction(async (tx) => {
            const existing = await tx.userFieldPermissionOverride.findFirst({
                where: { id, companyId },
                select: { membershipId: true, field: true, allowed: true },
            });
            if (!existing) throw new NotFoundException('User field permission override not found.');

            await tx.userFieldPermissionOverride.delete({ where: { id } });

            await this.auditService.write(tx, {
                companyId,
                actorId,
                operation: AuditOperation.DELETE,
                entityType: 'UserFieldPermissionOverride',
                entityId: id,
                before: { membershipId: existing.membershipId, field: existing.field, allowed: existing.allowed },
            });

            return { membershipId: existing.membershipId };
        });

        this.events.emit('config.permission.changed', { companyId, membershipId });
    }
}
