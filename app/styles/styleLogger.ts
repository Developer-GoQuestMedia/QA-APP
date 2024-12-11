import { CSSProperties } from 'react';

type StyleValue = string | number | CSSProperties;
type StyleMap = Record<string, StyleValue>;

interface LoggerOptions {
  prefix?: string;
  suffix?: string;
  separator?: string;
}

class StyleLogger {
  private styles: StyleMap;
  private options: LoggerOptions;

  constructor(options: LoggerOptions = {}) {
    this.styles = {};
    this.options = {
      prefix: options.prefix || '',
      suffix: options.suffix || '',
      separator: options.separator || ' ',
    };
  }

  log(key: string, value: StyleValue): void {
    this.styles[key] = value;
  }

  logMultiple(styles: StyleMap): void {
    Object.entries(styles).forEach(([key, value]) => {
      this.log(key, value);
    });
  }

  getStyleString(): string {
    return Object.entries(this.styles)
      .map(([key, value]) => {
        if (typeof value === 'object') {
          return Object.entries(value as CSSProperties)
            .map(([prop, val]) => `${key}-${prop}: ${val}`)
            .join(this.options.separator);
        }
        return `${key}: ${value}`;
      })
      .join(this.options.separator);
  }

  getFormattedStyle(customOptions?: Partial<LoggerOptions>): string {
    const options = { ...this.options, ...customOptions };
    const styleString = this.getStyleString();
    return `${options.prefix}${styleString}${options.suffix}`;
  }

  clear(): void {
    this.styles = {};
  }

  getStyles(): StyleMap {
    return { ...this.styles };
  }

  setOptions(options: Partial<LoggerOptions>): void {
    this.options = { ...this.options, ...options };
  }

  getOptions(): LoggerOptions {
    return { ...this.options };
  }
}

export default StyleLogger; 