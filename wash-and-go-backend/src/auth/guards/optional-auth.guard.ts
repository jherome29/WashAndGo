import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AuthService } from '../auth.service';

@Injectable()
export class OptionalAuthGuard implements CanActivate {
  constructor(private authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader: string = request.headers['authorization'];

    if (authHeader?.startsWith('Bearer ')) {
      try {
        const token = authHeader.slice(7);
        request.user = await this.authService.getUserFromToken(token);
      } catch {
        request.user = null;
      }
    } else {
      request.user = null;
    }

    return true;
  }
}
