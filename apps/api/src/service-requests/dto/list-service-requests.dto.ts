import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListServiceRequestsDto {
    @IsOptional()
    @IsString()
    stageId?: string;

    @IsOptional()
    @IsString()
    serviceTypeId?: string;

    // Filter requests by their associated client. Used by the client-detail
    // "Pedidos" tab to surface every request a given client has open or
    // closed. Tenant scoping (companyId) is applied alongside this filter
    // server-side, so a client id from another tenant resolves to zero rows.
    @IsOptional()
    @IsString()
    clientId?: string;

    @IsOptional()
    @IsString()
    assignedMembershipId?: string;

    @IsOptional()
    @Transform(({ value }) => {
        if (value === 'true' || value === true) return true;
        if (value === 'false' || value === false) return false;
        return value;
    })
    @IsBoolean()
    isCancelled?: boolean;

    @IsOptional()
    @Transform(({ value }) => parseInt(value, 10))
    @IsInt()
    @Min(1)
    @Max(100)
    limit?: number;

    @IsOptional()
    @Transform(({ value }) => parseInt(value, 10))
    @IsInt()
    @Min(0)
    skip?: number;
}
