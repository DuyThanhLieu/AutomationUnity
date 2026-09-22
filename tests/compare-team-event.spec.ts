import { test, expect } from '@playwright/test';
import { CompareApi } from '../API/compareApi';
import { ENDPOINTS } from '../API/endpoints';
import { compareJson } from '../API/compareHelper';
import fs from 'fs';

test(
  'Compare Standings Staging vs Production',
  async ({ request }) => {

    const api = new CompareApi(request);

    const stagingResponse =
      await api.getStaging(
        ENDPOINTS.TEAM_all
      );

    const prodResponse =
      await api.getProd(
        ENDPOINTS.TEAM_all
      );

    expect(
      stagingResponse.status()
    ).toBe(200);

    expect(
      prodResponse.status()
    ).toBe(200);

    const stagingData =
      await stagingResponse.json();

    const prodData =
      await prodResponse.json();

    if (!fs.existsSync('results')) {
      fs.mkdirSync('results');
    }

    fs.writeFileSync(
      'results/standings-staging.json',
      JSON.stringify(
        stagingData,
        null,
        2
      )
    );

    fs.writeFileSync(
      'results/standings-prod.json',
      JSON.stringify(
        prodData,
        null,
        2
      )
    );

    const differences =
      compareJson(
        stagingData,
        prodData
      );

    if (differences) {

      fs.writeFileSync(
        'results/standings-diff.json',
        JSON.stringify(
          differences,
          null,
          2
        )
      );

      console.log(
        '\n===== STANDINGS DIFFERENCES ====='
      );

      console.log(
        JSON.stringify(
          differences,
          null,
          2
        )
      );
    }

    expect(
      differences
    ).toBeUndefined();

  }
);
// npx playwright test tests/compare-team-event.spec.ts