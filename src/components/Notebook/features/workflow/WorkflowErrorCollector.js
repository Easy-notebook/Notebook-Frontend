/**
 * moved to features/workflow/WorkflowErrorCollector.js
 */
class WorkflowErrorCollector {
  constructor() {
    this.errors = [];
    this.maxErrors = 100;
    this.init();
  }
  init() {
    window.addEventListener('workflowError', (event) => {
      this.collectError(event.detail);
    });
    window.addEventListener('workflowStageCompleted', (event) => {
      this.logStageCompletion(event.detail);
    });
    window.addEventListener('workflowCompleted', (event) => {
      this.logWorkflowCompletion(event.detail);
    });
    window.workflowErrorCollector = this;
  }
  collectError(errorDetail) {
    const error = {
      ...errorDetail,
      id: this.generateErrorId(),
      collectedAt: new Date().toISOString(),
    };
    this.errors.unshift(error);
    if (this.errors.length > this.maxErrors) this.errors = this.errors.slice(0, this.maxErrors);
    this.logError(error);
    this.persistErrors();
  }
  logStageCompletion(detail) {
    console.log(
      `%c🎉 STAGE COMPLETED: ${detail.stageId}`,
      'color: #27ae60; font-weight: bold; font-size: 12px;',
      detail
    );
  }
  logWorkflowCompletion(detail) {
    console.log(
      `%c🏆 WORKFLOW COMPLETED!`,
      'color: #f39c12; font-weight: bold; font-size: 14px;',
      detail
    );
  }
  logError(error) {
    const styles = {
      DUPLICATE_STAGE_TRANSITION:
        'color:#e74c3c;background:#fadbd8;padding:4px 8px;border-radius:4px;',
      DUPLICATE_STAGE_COMPLETION_IN_TEMPLATE:
        'color:#c0392b;background:#f5b7b1;padding:4px 8px;border-radius:4px;',
      MISSING_REQUIREMENTS: 'color:#d68910;background:#fdeaa7;padding:4px 8px;border-radius:4px;',
      AI_STORE_OUT_OF_SYNC: 'color:#8e44ad;background:#e8daef;padding:4px 8px;border-radius:4px;',
      PERSISTENT_TRANSITION_BLOCK:
        'color:#922b21;background:#fadbd8;padding:4px 8px;border-radius:4px;',
      CONDITIONS_NOT_MET: 'color:#b7950b;background:#fcf3cf;padding:4px 8px;border-radius:4px;',
      RACE_CONDITION_DETECTED:
        'color:#943126;background:#fadbd8;padding:4px 8px;border-radius:4px;',
    };
    const style = styles[error.error] || 'color:#e74c3c;font-weight:bold;';
    console.group(`%c🚨 WORKFLOW ERROR: ${error.error}`, style);
    console.log('Error ID:', error.id);
    console.log('Message:', error.message);
    console.log('Timestamp:', error.timestamp);
    console.log('Details:', error);
    if (error.callStack) console.log('Call Stack:', error.callStack);
    console.groupEnd();
  }
  generateErrorId() {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  persistErrors() {
    try {
      const data = { errors: this.errors.slice(0, 20), lastUpdated: new Date().toISOString() };
      localStorage.setItem('workflowErrors', JSON.stringify(data));
    } catch (e) {
      console.warn('Failed to persist workflow errors to localStorage:', e);
    }
  }
  loadPersistedErrors() {
    try {
      const stored = localStorage.getItem('workflowErrors');
      if (stored) {
        const data = JSON.parse(stored);
        return data.errors || [];
      }
    } catch (e) {
      console.warn('Failed to load persisted workflow errors:', e);
    }
    return [];
  }
  getErrorsByType(t) {
    return this.errors.filter((e) => e.error === t);
  }
  getErrorsInTimeRange(start, end) {
    const s = new Date(start),
      e = new Date(end);
    return this.errors.filter((x) => {
      const d = new Date(x.timestamp);
      return d >= s && d <= e;
    });
  }
  getErrorStats() {
    const stats = {};
    this.errors.forEach((e) => {
      stats[e.error] = (stats[e.error] || 0) + 1;
    });
    return stats;
  }
  clearErrors() {
    this.errors = [];
    localStorage.removeItem('workflowErrors');
    console.log('🧹 Workflow errors cleared');
  }
  exportErrors() {
    const data = {
      errors: this.errors,
      exportedAt: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `workflow-errors-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
  analyzeDuplicateStageIssues() {
    const dupe = this.errors.filter(
      (e) =>
        e.error === 'DUPLICATE_STAGE_TRANSITION' ||
        e.error === 'DUPLICATE_STAGE_COMPLETION_IN_TEMPLATE'
    );
    const analysis = {
      totalDuplicates: dupe.length,
      stagesAffected: [...new Set(dupe.map((e) => e.stageId || e.attemptedStage))],
      timePattern: dupe.map((e) => ({ time: e.timestamp, stage: e.stageId || e.attemptedStage })),
      callStackPatterns: dupe.map((e) => e.callStack?.split('\n')[1]?.trim()).filter(Boolean),
    };
    console.group('🔍 Duplicate Stage Issues Analysis');
    console.log('Total duplicate attempts:', analysis.totalDuplicates);
    console.log('Stages affected:', analysis.stagesAffected);
    console.log('Time pattern:', analysis.timePattern);
    console.log('Common call locations:', [...new Set(analysis.callStackPatterns)]);
    console.groupEnd();
    return analysis;
  }
}
const workflowErrorCollector = new WorkflowErrorCollector();
export default workflowErrorCollector;
