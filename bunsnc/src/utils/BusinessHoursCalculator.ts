/**
 * Business Hours Calculator - Accurate calculation of business hours between dates
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import {
  BusinessHoursConfig,
  DEFAULT_BUSINESS_HOURS,
} from "../types/ContractualSLA";
import { logger } from "./Logger";

export class BusinessHoursCalculator {
  private config: BusinessHoursConfig;

  constructor(config: BusinessHoursConfig = DEFAULT_BUSINESS_HOURS) {
    this.config = config;
  }

  /**
   * Calculate business hours between two dates
   */
  calculateBusinessHours(startDate: Date, endDate: Date): number {
    if (startDate >= endDate) {
      return 0;
    }

    let totalBusinessHours = 0;
    let currentDate = new Date(startDate);
    const finalDate = new Date(endDate);

    // Iterate through each day
    while (currentDate < finalDate) {
      const nextDay = new Date(currentDate);
      nextDay.setDate(nextDay.getDate() + 1);
      nextDay.setHours(0, 0, 0, 0);

      // Calculate hours for this day
      const dayEnd = nextDay > finalDate ? finalDate : nextDay;
      const hoursThisDay = this.calculateBusinessHoursForDay(
        currentDate,
        dayEnd,
      );

      totalBusinessHours += hoursThisDay;

      // Move to next day
      currentDate = nextDay;
    }

    return Math.round(totalBusinessHours * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Calculate business hours for a specific day
   */
  private calculateBusinessHoursForDay(startDate: Date, endDate: Date): number {
    const dayOfWeek = startDate.getDay(); // 0 = Sunday, 1 = Monday, etc.

    // Skip if it's a holiday
    if (this.isHoliday(startDate)) {
      return 0;
    }

    // Get business hours for this day of week
    const businessHours = this.getBusinessHoursForDay(dayOfWeek);
    if (!businessHours) {
      return 0; // No business hours for this day
    }

    // Parse business hours
    const [startHour, startMinute] = businessHours.start.split(":").map(Number);
    const [endHour, endMinute] = businessHours.end.split(":").map(Number);

    // Create business day boundaries
    const businessStart = new Date(startDate);
    businessStart.setHours(startHour, startMinute, 0, 0);

    const businessEnd = new Date(startDate);
    businessEnd.setHours(endHour, endMinute, 0, 0);

    // Calculate intersection of requested time period with business hours
    const effectiveStart =
      startDate > businessStart ? startDate : businessStart;
    const effectiveEnd = endDate < businessEnd ? endDate : businessEnd;

    // No overlap with business hours
    if (effectiveStart >= effectiveEnd) {
      return 0;
    }

    // Calculate hours
    const milliseconds = effectiveEnd.getTime() - effectiveStart.getTime();
    return milliseconds / (1000 * 60 * 60); // Convert to hours
  }

  /**
   * Get business hours configuration for a day of the week
   */
  private getBusinessHoursForDay(
    dayOfWeek: number,
  ): { start: string; end: string } | null {
    switch (dayOfWeek) {
      case 1:
        return this.config.monday;
      case 2:
        return this.config.tuesday;
      case 3:
        return this.config.wednesday;
      case 4:
        return this.config.thursday;
      case 5:
        return this.config.friday;
      case 6:
        return this.config.saturday || null;
      case 0:
        return this.config.sunday || null;
      default:
        return null;
    }
  }

  /**
   * Check if a date is a holiday
   */
  private isHoliday(date: Date): boolean {
    const dateString = date.toISOString().split("T")[0]; // YYYY-MM-DD format
    return this.config.holidays.includes(dateString);
  }

  /**
   * Add business hours to a date
   */
  addBusinessHours(startDate: Date, hoursToAdd: number): Date {
    if (hoursToAdd <= 0) {
      return new Date(startDate);
    }

    let currentDate = new Date(startDate);
    let remainingHours = hoursToAdd;

    while (remainingHours > 0) {
      const dayOfWeek = currentDate.getDay();
      const businessHours = this.getBusinessHoursForDay(dayOfWeek);

      // Skip holidays and non-business days
      if (this.isHoliday(currentDate) || !businessHours) {
        currentDate.setDate(currentDate.getDate() + 1);
        currentDate.setHours(0, 0, 0, 0);
        continue;
      }

      // Parse business hours
      const [startHour, startMinute] = businessHours.start
        .split(":")
        .map(Number);
      const [endHour, endMinute] = businessHours.end.split(":").map(Number);

      // Calculate available hours for this day
      const businessStart = new Date(currentDate);
      businessStart.setHours(startHour, startMinute, 0, 0);

      const businessEnd = new Date(currentDate);
      businessEnd.setHours(endHour, endMinute, 0, 0);

      // If current time is before business start, move to business start
      if (currentDate < businessStart) {
        currentDate = new Date(businessStart);
      }

      // If current time is after business end, move to next day
      if (currentDate >= businessEnd) {
        currentDate.setDate(currentDate.getDate() + 1);
        currentDate.setHours(0, 0, 0, 0);
        continue;
      }

      // Calculate hours available in this business day
      const availableHours =
        (businessEnd.getTime() - currentDate.getTime()) / (1000 * 60 * 60);

      if (remainingHours <= availableHours) {
        // Can finish within this business day
        currentDate.setTime(
          currentDate.getTime() + remainingHours * 60 * 60 * 1000,
        );
        remainingHours = 0;
      } else {
        // Need to continue to next business day
        remainingHours -= availableHours;
        currentDate.setDate(currentDate.getDate() + 1);
        currentDate.setHours(0, 0, 0, 0);
      }
    }

    return currentDate;
  }

  /**
   * Check if a specific time is within business hours
   */
  isBusinessTime(date: Date): boolean {
    const dayOfWeek = date.getDay();
    const businessHours = this.getBusinessHoursForDay(dayOfWeek);

    if (!businessHours || this.isHoliday(date)) {
      return false;
    }

    const [startHour, startMinute] = businessHours.start.split(":").map(Number);
    const [endHour, endMinute] = businessHours.end.split(":").map(Number);

    const currentHour = date.getHours();
    const currentMinute = date.getMinutes();

    const currentMinutes = currentHour * 60 + currentMinute;
    const startMinutes = startHour * 60 + startMinute;
    const endMinutes = endHour * 60 + endMinute;

    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }

  /**
   * Get next business day
   */
  getNextBusinessDay(date: Date): Date {
    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);
    nextDay.setHours(0, 0, 0, 0);

    // Find next business day
    while (true) {
      const dayOfWeek = nextDay.getDay();
      const businessHours = this.getBusinessHoursForDay(dayOfWeek);

      if (businessHours && !this.isHoliday(nextDay)) {
        // Set to start of business hours
        const [startHour, startMinute] = businessHours.start
          .split(":")
          .map(Number);
        nextDay.setHours(startHour, startMinute, 0, 0);
        return nextDay;
      }

      nextDay.setDate(nextDay.getDate() + 1);
    }
  }

  /**
   * Calculate SLA deadline considering business hours
   */
  calculateSLADeadline(
    startDate: Date,
    slaHours: number,
    businessHoursOnly: boolean = false,
  ): Date {
    if (!businessHoursOnly) {
      // Standard 24/7 calculation
      const deadline = new Date(startDate);
      deadline.setTime(deadline.getTime() + slaHours * 60 * 60 * 1000);
      return deadline;
    }

    // Business hours calculation
    return this.addBusinessHours(startDate, slaHours);
  }

  /**
   * Update business hours configuration
   */
  updateConfig(newConfig: Partial<BusinessHoursConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.info("🕒 [BusinessHours] Configuration updated");
  }

  /**
   * Get current configuration
   */
  getConfig(): BusinessHoursConfig {
    return { ...this.config };
  }

  /**
   * Add holiday to the configuration
   */
  addHoliday(date: string): void {
    if (!this.config.holidays.includes(date)) {
      this.config.holidays.push(date);
      this.config.holidays.sort();
      logger.info(`📅 [BusinessHours] Holiday added: ${date}`);
    }
  }

  /**
   * Remove holiday from the configuration
   */
  removeHoliday(date: string): void {
    const index = this.config.holidays.indexOf(date);
    if (index > -1) {
      this.config.holidays.splice(index, 1);
      logger.info(`📅 [BusinessHours] Holiday removed: ${date}`);
    }
  }
}
