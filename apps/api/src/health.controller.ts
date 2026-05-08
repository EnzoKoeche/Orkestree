import { Controller, Get } from '@nestjs/common';

// Liveness probe for Render (and any other platform that polls
// healthCheckPath). Intentionally trivial: if the process is up enough to
// answer HTTP, it's healthy. Deeper readiness checks (DB, Redis) belong on a
// separate /ready route so a transient dependency hiccup doesn't restart the
// whole service.
@Controller('health')
export class HealthController {
    @Get()
    check(): { status: 'ok' } {
        return { status: 'ok' };
    }
}
