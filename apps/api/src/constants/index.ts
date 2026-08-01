import type { JwtSignOptions } from '@nestjs/jwt';

type JwtConstants = {
  expiresIn: JwtSignOptions['expiresIn'];
};

export const jwtConstants: JwtConstants = {
  expiresIn: '30d',
};
