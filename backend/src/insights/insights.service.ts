import { Injectable } from '@nestjs/common';
import { InsightsRepository } from './insights.repository.js';
import {
  MIN_GROUP_SIZE,
  pairGenderGaps,
  pairOverallGap,
  showableGroups,
  showableOverall,
} from './insights.rules.js';
import type {
  GenderGapQuery,
  GenderGapResponse,
  PayInsightsResponse,
  PayQuery,
} from './insights.schemas.js';

@Injectable()
export class InsightsService {
  constructor(private readonly insights: InsightsRepository) {}

  /**
   * How current employees are paid, grouped by country, department or level, in US dollars.
   * The privacy rule is applied here: groups of fewer than 5 people are counted, never shown.
   */
  async pay(query: PayQuery): Promise<PayInsightsResponse> {
    const today = new Date();
    const { groups, overall } = await this.insights.payBy(
      query.groupBy,
      {
        countries: query.countries,
        departments: query.departments,
        levels: query.levels,
      },
      today,
    );

    const shown = showableGroups(groups, query.groupBy);
    const everyone = showableOverall(overall);
    return {
      groupBy: query.groupBy,
      asOf: today.toISOString().slice(0, 10),
      currency: 'USD',
      minimumGroupSize: MIN_GROUP_SIZE,
      overall: everyone && {
        headcount: everyone.headcount,
        p25Usd: everyone.p25,
        medianUsd: everyone.median,
        p75Usd: everyone.p75,
        totalAnnualUsd: everyone.total,
      },
      groups: shown.groups.map((group) => ({
        key: group.key,
        label: group.label,
        headcount: group.headcount,
        p25Usd: group.p25,
        medianUsd: group.median,
        p75Usd: group.p75,
        totalAnnualUsd: group.total,
      })),
      hiddenGroups: shown.hiddenGroups,
      excluded: overall.excluded,
    };
  }

  /**
   * The median pay of women against men, level by level and overall. A level is compared
   * only when women and men each number at least 5 (the privacy rule, applied to each side).
   */
  async genderGap(query: GenderGapQuery): Promise<GenderGapResponse> {
    const today = new Date();
    const { levels, overall, otherGender, excluded } =
      await this.insights.genderPayBy(
        {
          countries: query.countries,
          departments: query.departments,
          levels: query.levels,
        },
        today,
      );
    const paired = pairGenderGaps(levels);
    return {
      asOf: today.toISOString().slice(0, 10),
      currency: 'USD',
      minimumGroupSize: MIN_GROUP_SIZE,
      overall: pairOverallGap(overall),
      levels: paired.levels,
      hiddenLevels: paired.hiddenLevels,
      otherGender,
      excluded,
    };
  }
}
