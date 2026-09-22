import { APIRequestContext } from '@playwright/test';
import { ENV } from '../config/env';

export class CompareApi {

  constructor(
    private request: APIRequestContext
  ) {}

  async getStaging(endpoint: string) {
    return await this.request.get(
      `${ENV.staging}${endpoint}`
    );
  }

  async getProd(endpoint: string) {
    return await this.request.get(
      `${ENV.prod}${endpoint}`
    );
  }
}