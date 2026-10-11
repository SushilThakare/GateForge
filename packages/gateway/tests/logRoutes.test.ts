/**
 * @file packages/gateway/src/routes/logRoutes.test.ts
 * @description Unit tests for logRoutes validation schemas, date range resolution, and query filters.
 */

import {
  queryLogsSchema,
  logStatsQuerySchema,
  analyticsQuerySchema,
  logIdParamSchema,
  resolveDateRange,
  resolveAnalyticsDateRange,
  TimeRangePreset,
  AnalyticsTimeRangePreset,
} from '../src/routes/logRoutes.js';

describe('Log Routes Unit & Validation Tests', () => {
  describe('queryLogsSchema', () => {
    it('should parse valid cursor pagination parameters with defaults', () => {
      const result = queryLogsSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(50);
        expect(result.data.cursor).toBeUndefined();
      }
    });

    it('should parse explicit limit, cursor, status, and method filters', () => {
      const result = queryLogsSchema.safeParse({
        cursor: '550e8400-e29b-41d4-a716-446655440000',
        limit: '25',
        status: '4xx',
        method: 'post',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(25);
        expect(result.data.cursor).toBe('550e8400-e29b-41d4-a716-446655440000');
        expect(result.data.status).toBe('4xx');
        expect(result.data.method).toBe('POST');
      }
    });

    it('should reject invalid status code string', () => {
      const result = queryLogsSchema.safeParse({ status: 'invalid_status' });
      expect(result.success).toBe(false);
    });

    it('should reject limit greater than 100', () => {
      const result = queryLogsSchema.safeParse({ limit: '500' });
      expect(result.success).toBe(false);
    });
  });

  describe('logStatsQuerySchema', () => {
    it('should default timeRange to 24h when omitted', () => {
      const result = logStatsQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.timeRange).toBe(TimeRangePreset.TWENTY_FOUR_HOURS);
      }
    });

    it('should accept valid timeRange presets (1h, 24h, 7d)', () => {
      const res1h = logStatsQuerySchema.safeParse({ timeRange: '1h' });
      const res7d = logStatsQuerySchema.safeParse({ timeRange: '7d' });
      expect(res1h.success).toBe(true);
      expect(res7d.success).toBe(true);
    });

    it('should reject invalid timeRange preset', () => {
      const result = logStatsQuerySchema.safeParse({ timeRange: '30d' });
      expect(result.success).toBe(false);
    });
  });

  describe('logIdParamSchema', () => {
    it('should accept valid UUID log ID', () => {
      const result = logIdParamSchema.safeParse({ id: '550e8400-e29b-41d4-a716-446655440000' });
      expect(result.success).toBe(true);
    });

    it('should reject non-UUID log ID', () => {
      const result = logIdParamSchema.safeParse({ id: 'stats' });
      expect(result.success).toBe(false);
    });
  });

  describe('resolveDateRange', () => {
    it('should compute 1h duration window correctly', () => {
      const { from, to, durationMinutes } = resolveDateRange(TimeRangePreset.ONE_HOUR);
      expect(to.getTime()).toBeGreaterThan(from.getTime());
      expect(Math.round(durationMinutes)).toBe(60);
    });

    it('should compute 24h duration window correctly', () => {
      const { from, to, durationMinutes } = resolveDateRange(TimeRangePreset.TWENTY_FOUR_HOURS);
      expect(to.getTime()).toBeGreaterThan(from.getTime());
      expect(Math.round(durationMinutes)).toBe(1440);
    });

    it('should prioritize explicit dateFrom and dateTo overrides', () => {
      const customFrom = '2026-10-01T00:00:00.000Z';
      const customTo = '2026-10-02T00:00:00.000Z';
      const { from, to, durationMinutes } = resolveDateRange(
        TimeRangePreset.TWENTY_FOUR_HOURS,
        customFrom,
        customTo
      );
      expect(from.toISOString()).toBe(customFrom);
      expect(to.toISOString()).toBe(customTo);
      expect(Math.round(durationMinutes)).toBe(1440);
    });
  });

  describe('analyticsQuerySchema', () => {
    it('should default timeRange to 24h when omitted', () => {
      const result = analyticsQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.timeRange).toBe(AnalyticsTimeRangePreset.TWENTY_FOUR_HOURS);
      }
    });

    it('should accept valid analytics time ranges (1h, 6h, 24h, 7d, 30d)', () => {
      for (const preset of ['1h', '6h', '24h', '7d', '30d']) {
        const res = analyticsQuerySchema.safeParse({ timeRange: preset });
        expect(res.success).toBe(true);
      }
    });

    it('should reject unsupported analytics time range', () => {
      const result = analyticsQuerySchema.safeParse({ timeRange: '90d' });
      expect(result.success).toBe(false);
    });
  });

  describe('resolveAnalyticsDateRange', () => {
    it('should compute 1h with 60s buckets', () => {
      const { from, to, durationMinutes, bucketSeconds } = resolveAnalyticsDateRange(
        AnalyticsTimeRangePreset.ONE_HOUR
      );
      expect(to.getTime()).toBeGreaterThan(from.getTime());
      expect(Math.round(durationMinutes)).toBe(60);
      expect(bucketSeconds).toBe(60);
    });

    it('should compute 6h with 300s buckets', () => {
      const { durationMinutes, bucketSeconds } = resolveAnalyticsDateRange(
        AnalyticsTimeRangePreset.SIX_HOURS
      );
      expect(Math.round(durationMinutes)).toBe(360);
      expect(bucketSeconds).toBe(300);
    });

    it('should compute 30d with 28800s buckets', () => {
      const { durationMinutes, bucketSeconds } = resolveAnalyticsDateRange(
        AnalyticsTimeRangePreset.THIRTY_DAYS
      );
      expect(Math.round(durationMinutes)).toBe(43200);
      expect(bucketSeconds).toBe(28800);
    });
  });
});
