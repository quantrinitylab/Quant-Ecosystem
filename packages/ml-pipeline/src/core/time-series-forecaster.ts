// ============================================================================
// ML Pipeline - Time Series Forecaster
// ============================================================================

import {
  TimeSeriesPoint,
  Forecast,
  ARIMAConfig,
  ExponentialSmoothingConfig,
  SeasonalityResult,
} from '../types';

/**
 * @simulated This implementation is a simulation/prototype.
 * Classification: NAIVE
 * Reason: Moving average/exponential smoothing only
 * Production path: Use Prophet, ARIMA, or neural forecasting
 */
export class TimeSeriesForecaster {
  private data: TimeSeriesPoint[] = [];
  private residuals: number[] = [];
  private seasonal: number[] = [];
  private fitted: boolean = false;

  constructor() {}

  // Add data points
  addData(points: TimeSeriesPoint[]): void {
    this.data.push(...points);
    this.data.sort((a, b) => a.timestamp - b.timestamp);
  }

  // Simple Exponential Smoothing (SES)
  simpleExponentialSmoothing(alpha: number, horizon: number = 1): Forecast[] {
    const values = this.data.map((p) => p.value);
    if (values.length === 0) return [];
    let level: number = values[0]!;
    const smoothed: number[] = [level];
    this.residuals = [];
    for (let i = 1; i < values.length; i++) {
      level = alpha * values[i]! + (1 - alpha) * level;
      smoothed.push(level);
      this.residuals.push(values[i]! - smoothed[i - 1]!);
    }
    this.fitted = true;
    // Generate forecasts with confidence intervals
    const residualVar = this.computeResidualVariance();
    const forecasts: Forecast[] = [];
    const lastTimestamp = this.data[this.data.length - 1]?.timestamp ?? 0;
    const interval = this.estimateInterval();
    for (let h = 1; h <= horizon; h++) {
      const width = 1.96 * Math.sqrt(residualVar * h);
      forecasts.push({
        point: level,
        lower: level - width,
        upper: level + width,
        timestamp: lastTimestamp + h * interval,
      });
    }
    return forecasts;
  }

  // Double Exponential Smoothing (Holt's method)
  doubleExponentialSmoothing(alpha: number, beta: number, horizon: number = 1): Forecast[] {
    const values = this.data.map((p) => p.value);
    if (values.length < 2) return [];
    let level: number = values[0]!;
    let trend: number = values[1]! - values[0]!;
    this.residuals = [];
    for (let i = 1; i < values.length; i++) {
      const prevLevel = level;
      level = alpha * values[i]! + (1 - alpha) * (level + trend);
      trend = beta * (level - prevLevel) + (1 - beta) * trend;
      this.residuals.push(values[i]! - (prevLevel + trend));
    }
    this.fitted = true;
    const residualVar = this.computeResidualVariance();
    const forecasts: Forecast[] = [];
    const lastTimestamp = this.data[this.data.length - 1]?.timestamp ?? 0;
    const interval = this.estimateInterval();
    for (let h = 1; h <= horizon; h++) {
      const point = level + h * trend;
      const width = 1.96 * Math.sqrt(residualVar * (1 + h * h * 0.1));
      forecasts.push({
        point,
        lower: point - width,
        upper: point + width,
        timestamp: lastTimestamp + h * interval,
      });
    }
    return forecasts;
  }

  // Triple Exponential Smoothing (Holt-Winters)
  tripleExponentialSmoothing(config: ExponentialSmoothingConfig, horizon: number = 1): Forecast[] {
    const values = this.data.map((p) => p.value);
    const period = config.seasonalPeriod ?? 12;
    if (values.length < period * 2) {
      return this.doubleExponentialSmoothing(config.alpha, config.beta ?? 0.1, horizon);
    }
    const alpha = config.alpha;
    const beta = config.beta ?? 0.1;
    const gamma = config.gamma ?? 0.1;
    // Initialize seasonal components
    this.seasonal = new Array(period).fill(0);
    const firstPeriodMean = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = 0; i < period; i++) {
      this.seasonal[i] = values[i]! - firstPeriodMean;
    }
    let level = firstPeriodMean;
    let trend = (values[period]! - values[0]!) / period;
    this.residuals = [];
    for (let i = period; i < values.length; i++) {
      const seasonalIdx = i % period;
      const prevLevel = level;
      level = alpha * (values[i]! - this.seasonal[seasonalIdx]!) + (1 - alpha) * (level + trend);
      trend = beta * (level - prevLevel) + (1 - beta) * trend;
      this.seasonal[seasonalIdx] =
        gamma * (values[i]! - level) + (1 - gamma) * this.seasonal[seasonalIdx]!;
      const forecast = prevLevel + trend + this.seasonal[seasonalIdx]!;
      this.residuals.push(values[i]! - forecast);
    }
    // Apply damping if requested
    const phi = config.damped ? 0.98 : 1.0;
    this.fitted = true;
    const residualVar = this.computeResidualVariance();
    const forecasts: Forecast[] = [];
    const lastTimestamp = this.data[this.data.length - 1]?.timestamp ?? 0;
    const interval = this.estimateInterval();
    let dampedTrend = 0;
    for (let h = 1; h <= horizon; h++) {
      dampedTrend += Math.pow(phi, h) * trend;
      const seasonalIdx = (values.length + h - 1) % period;
      const point = level + dampedTrend + this.seasonal[seasonalIdx]!;
      const width = 1.96 * Math.sqrt(residualVar * (1 + h * 0.2));
      forecasts.push({
        point,
        lower: point - width,
        upper: point + width,
        timestamp: lastTimestamp + h * interval,
      });
    }
    return forecasts;
  }

  // Detect seasonality using autocorrelation
  detectSeasonality(maxLag?: number): SeasonalityResult {
    const values = this.data.map((p) => p.value);
    const n = values.length;
    const maxL = maxLag ?? Math.floor(n / 2);
    const mean = values.reduce((a, b) => a + b, 0) / n;
    // Compute autocorrelations
    let variance = 0;
    for (let i = 0; i < n; i++) {
      variance += (values[i]! - mean) ** 2;
    }
    variance /= n;
    const autocorrelations: number[] = [];
    for (let lag = 1; lag <= maxL; lag++) {
      let sum = 0;
      for (let i = 0; i < n - lag; i++) {
        sum += (values[i]! - mean) * (values[i + lag]! - mean);
      }
      const acf = sum / (n * variance);
      autocorrelations.push(acf);
    }
    // Find the lag with highest autocorrelation (seasonal period)
    let bestLag = 1;
    let bestAcf = -1;
    for (let i = 1; i < autocorrelations.length; i++) {
      if (autocorrelations[i]! > bestAcf && i > 1) {
        bestAcf = autocorrelations[i]!;
        bestLag = i + 1;
      }
    }
    return {
      period: bestLag,
      strength: Math.max(0, bestAcf),
      autocorrelations,
    };
  }

  // ARIMA-like forecasting
  arimaForecast(config: ARIMAConfig, horizon: number = 1): Forecast[] {
    let values = this.data.map((p) => p.value);
    // Differencing for stationarity
    for (let d = 0; d < config.d; d++) {
      const diffed: number[] = [];
      for (let i = 1; i < values.length; i++) {
        diffed.push(values[i]! - values[i - 1]!);
      }
      values = diffed;
    }
    if (values.length < config.p + config.q + 1) {
      return this.simpleExponentialSmoothing(0.3, horizon);
    }
    // AR coefficients estimation (Yule-Walker simplified)
    const arCoeffs = this.estimateARCoeffs(values, config.p);
    // MA component using residuals
    const residuals: number[] = [];
    const fitted: number[] = [];
    for (let i = config.p; i < values.length; i++) {
      let arComponent = 0;
      for (let j = 0; j < config.p; j++) {
        arComponent += arCoeffs[j]! * values[i - j - 1]!;
      }
      let maComponent = 0;
      for (let j = 0; j < Math.min(config.q, residuals.length); j++) {
        maComponent += 0.5 * residuals[residuals.length - 1 - j]!; // simplified MA weights
      }
      const prediction = arComponent + maComponent;
      fitted.push(prediction);
      residuals.push(values[i]! - prediction);
    }
    this.residuals = residuals;
    this.fitted = true;
    // Generate forecasts
    const residualVar = this.computeResidualVariance();
    const forecasts: Forecast[] = [];
    const lastTimestamp = this.data[this.data.length - 1]?.timestamp ?? 0;
    const interval = this.estimateInterval();
    const extendedValues = [...values];
    const extendedResiduals = [...residuals];
    for (let h = 1; h <= horizon; h++) {
      let arComponent = 0;
      for (let j = 0; j < config.p; j++) {
        const idx = extendedValues.length - 1 - j;
        if (idx >= 0) arComponent += arCoeffs[j]! * extendedValues[idx]!;
      }
      let maComponent = 0;
      for (let j = 0; j < Math.min(config.q, extendedResiduals.length); j++) {
        maComponent += 0.3 * extendedResiduals[extendedResiduals.length - 1 - j]!;
      }
      const point = arComponent + maComponent;
      extendedValues.push(point);
      extendedResiduals.push(0);
      // Undo differencing
      let forecastValue = point;
      if (config.d > 0) {
        const originalValues = this.data.map((p) => p.value);
        forecastValue = originalValues[originalValues.length - 1]! + point;
      }
      const width = 1.96 * Math.sqrt(residualVar * h);
      forecasts.push({
        point: forecastValue,
        lower: forecastValue - width,
        upper: forecastValue + width,
        timestamp: lastTimestamp + h * interval,
      });
    }
    return forecasts;
  }

  private estimateARCoeffs(values: number[], order: number): number[] {
    if (order === 0) return [];
    const n = values.length;
    const mean = values.reduce((a, b) => a + b, 0) / n;
    // Compute autocorrelations for Yule-Walker
    const acf: number[] = [1];
    let variance = 0;
    for (let i = 0; i < n; i++) variance += (values[i]! - mean) ** 2;
    variance /= n;
    if (variance === 0) return new Array(order).fill(0);
    for (let lag = 1; lag <= order; lag++) {
      let sum = 0;
      for (let i = lag; i < n; i++) {
        sum += (values[i]! - mean) * (values[i - lag]! - mean);
      }
      acf.push(sum / (n * variance));
    }
    // Levinson-Durbin algorithm
    const coeffs: number[] = new Array(order).fill(0);
    coeffs[0] = acf[1]!;
    let error = 1 - coeffs[0]! * coeffs[0]!;
    for (let m = 1; m < order; m++) {
      let lambda: number = acf[m + 1]!;
      for (let j = 0; j < m; j++) {
        lambda -= coeffs[j]! * acf[m - j]!;
      }
      lambda /= error;
      const newCoeffs = [...coeffs];
      newCoeffs[m] = lambda;
      for (let j = 0; j < m; j++) {
        newCoeffs[j] = coeffs[j]! - lambda * coeffs[m - 1 - j]!;
      }
      for (let j = 0; j <= m; j++) coeffs[j] = newCoeffs[j]!;
      error *= 1 - lambda * lambda;
      if (error <= 0) break;
    }
    return coeffs;
  }

  // Fit model parameters by minimizing MSE
  optimizeParameters(method: 'ses' | 'double' | 'triple' = 'ses'): ExponentialSmoothingConfig {
    let bestAlpha = 0.5;
    let bestBeta = 0.1;
    let bestGamma = 0.1;
    let bestError = Infinity;
    const values = this.data.map((p) => p.value);
    // Grid search over parameter space
    for (let a = 0.1; a <= 0.9; a += 0.1) {
      if (method === 'ses') {
        const error = this.computeSESError(values, a);
        if (error < bestError) {
          bestError = error;
          bestAlpha = a;
        }
      } else {
        for (let b = 0.05; b <= 0.5; b += 0.1) {
          const error = this.computeDoubleError(values, a, b);
          if (error < bestError) {
            bestError = error;
            bestAlpha = a;
            bestBeta = b;
          }
        }
      }
    }
    return { alpha: bestAlpha, beta: bestBeta, gamma: bestGamma };
  }

  private computeSESError(values: number[], alpha: number): number {
    let level: number = values[0]!;
    let mse = 0;
    for (let i = 1; i < values.length; i++) {
      const forecast = level;
      mse += (values[i]! - forecast) ** 2;
      level = alpha * values[i]! + (1 - alpha) * level;
    }
    return mse / (values.length - 1);
  }

  private computeDoubleError(values: number[], alpha: number, beta: number): number {
    if (values.length < 2) return Infinity;
    let level: number = values[0]!;
    let trend: number = values[1]! - values[0]!;
    let mse = 0;
    for (let i = 1; i < values.length; i++) {
      const forecast = level + trend;
      mse += (values[i]! - forecast) ** 2;
      const prevLevel = level;
      level = alpha * values[i]! + (1 - alpha) * (level + trend);
      trend = beta * (level - prevLevel) + (1 - beta) * trend;
    }
    return mse / (values.length - 1);
  }

  // Residual analysis
  analyzeResiduals(): { mean: number; variance: number; isWhiteNoise: boolean; ljungBox: number } {
    if (this.residuals.length === 0)
      return { mean: 0, variance: 0, isWhiteNoise: true, ljungBox: 0 };
    const n = this.residuals.length;
    const mean = this.residuals.reduce((a, b) => a + b, 0) / n;
    const variance = this.residuals.reduce((sum, r) => sum + (r - mean) ** 2, 0) / n;
    // Ljung-Box test statistic (simplified)
    const maxLag = Math.min(10, Math.floor(n / 5));
    let ljungBox = 0;
    for (let lag = 1; lag <= maxLag; lag++) {
      let sum = 0;
      for (let i = lag; i < n; i++) {
        sum += (this.residuals[i]! - mean) * (this.residuals[i - lag]! - mean);
      }
      const rk = sum / (n * variance);
      ljungBox += (rk * rk) / (n - lag);
    }
    ljungBox *= n * (n + 2);
    // Critical value approximation (chi-squared with maxLag df)
    const isWhiteNoise = ljungBox < maxLag * 2;
    return { mean, variance, isWhiteNoise, ljungBox };
  }

  private computeResidualVariance(): number {
    if (this.residuals.length === 0) return 1;
    const mean = this.residuals.reduce((a, b) => a + b, 0) / this.residuals.length;
    return this.residuals.reduce((sum, r) => sum + (r - mean) ** 2, 0) / this.residuals.length;
  }

  private estimateInterval(): number {
    if (this.data.length < 2) return 1;
    const intervals: number[] = [];
    for (let i = 1; i < Math.min(this.data.length, 100); i++) {
      intervals.push(this.data[i]!.timestamp - this.data[i - 1]!.timestamp);
    }
    return intervals.reduce((a, b) => a + b, 0) / intervals.length;
  }

  getDataLength(): number {
    return this.data.length;
  }

  isFitted(): boolean {
    return this.fitted;
  }

  reset(): void {
    this.data = [];
    this.residuals = [];
    this.seasonal = [];
    this.fitted = false;
  }
}
