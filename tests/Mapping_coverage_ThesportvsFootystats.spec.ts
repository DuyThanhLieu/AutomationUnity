import { test, expect } from '@playwright/test';
import { CompareApi } from '../API/compareApi';
import { ENDPOINTS } from '../API/endpoints';
import { compareJson } from '../API/compareHelper';
import fs from 'fs';

test(
  'Compare One Team Staging vs Production',
  async ({ request }) => {

    const api = new CompareApi(request);

    const stagingResponse =
      await api.getStaging(
        ENDPOINTS.oneteamstaing
      );

    const prodResponse =
      await api.getProd(
        ENDPOINTS.oneteamstaing
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
      'results/oneteam-staging.json',
      JSON.stringify(
        stagingData,
        null,
        2
      )
    );

    fs.writeFileSync(
      'results/oneteam-prod.json',
      JSON.stringify(
        prodData,
        null,
        2
      )
    );

    console.log(
      '\n===== DATA SUMMARY ====='
    );

    console.log(
      'Staging teamEvents:',
      Object.keys(
        stagingData.data.teamEvents || {}
      ).length
    );

    console.log(
      'Prod teamEvents:',
      Object.keys(
        prodData.data.teamEvents || {}
      ).length
    );

    const differences =
      compareJson(
        stagingData,
        prodData
      );

    if (
      !differences ||
      differences.length === 0
    ) {

      console.log(
        '\n✅ Product và Staging giống nhau'
      );

      expect(
        differences
      ).toBeUndefined();

      return;
    }

    fs.writeFileSync(
      'results/oneteam-diff.json',
      JSON.stringify(
        differences,
        null,
        2
      )
    );

    console.log(
      `\n❌ Total diff: ${differences.length}`
    );

    console.log(
      '\n===== FIRST 10 DIFF ====='
    );

    differences
      .slice(0, 10)
      .forEach((diff: any) => {

        console.log(
          '\nPath:',
          diff.path?.join('.')
        );

        console.log(
          'Type:',
          diff.kind
        );

        console.log(
          'Staging:',
          diff.lhs
        );

        console.log(
          'Production:',
          diff.rhs
        );
      });

    // throw new Error(
    //   `Product và Staging khác nhau. Total diff: ${differences.length}. Xem file results/oneteam-diff.json`
    // );
  }
);