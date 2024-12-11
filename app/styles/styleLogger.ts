interface StyleLog {
  component: string;
  styles: Record<string, any>;
  event?: string;
  additionalInfo?: Record<string, any>;
}

class StyleLogger {
  private static instance: StyleLogger;
  private logs: StyleLog[] = [];

  private constructor() {}

  static getInstance(): StyleLogger {
    if (!StyleLogger.instance) {
      StyleLogger.instance = new StyleLogger();
    }
    return StyleLogger.instance;
  }

  log({ component, styles, event = 'render', additionalInfo = {} }: StyleLog) {
    const log = {
      timestamp: new Date().toISOString(),
      component,
      event,
      styles,
      ...additionalInfo
    };
    
    this.logs.push(log);
    console.log(`Style Log - ${component} (${event}):`, log);
  }

  getStyleHistory(component?: string) {
    return component 
      ? this.logs.filter(log => log.component === component)
      : this.logs;
  }

  clearLogs() {
    this.logs = [];
  }
}

export const styleLogger = StyleLogger.getInstance();

// Utility functions for common style logging scenarios
export const logComponentRender = (component: string, styles: Record<string, any>) => {
  styleLogger.log({
    component,
    styles,
    event: 'render'
  });
};

export const logStyleInteraction = (
  component: string, 
  styles: Record<string, any>,
  interactionType: string,
  details?: Record<string, any>
) => {
  styleLogger.log({
    component,
    styles,
    event: `interaction:${interactionType}`,
    additionalInfo: details
  });
};

export const logThemeChange = (
  component: string,
  oldStyles: Record<string, any>,
  newStyles: Record<string, any>
) => {
  styleLogger.log({
    component,
    styles: newStyles,
    event: 'theme-change',
    additionalInfo: {
      previousStyles: oldStyles,
      changes: Object.keys(newStyles).filter(key => oldStyles[key] !== newStyles[key])
    }
  });
};

export const logStyleError = (
  component: string,
  styles: Record<string, any>,
  error: Error
) => {
  styleLogger.log({
    component,
    styles,
    event: 'error',
    additionalInfo: {
      error: {
        message: error.message,
        stack: error.stack
      }
    }
  });
}; 