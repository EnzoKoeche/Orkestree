import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { CompanyMembership } from '@prisma/client';

export const CurrentMembership = createParamDecorator(
    (_data: unknown, ctx: ExecutionContext): Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'> => {
        const request = ctx.switchToHttp().getRequest();
        return request.companyMembership;
    },
);
