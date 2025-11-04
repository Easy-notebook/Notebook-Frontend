/**
 * Workflow Error Collector
 * Collects and analyzes workflow-related errors for debugging
 */

class WorkflowErrorCollector {
    constructor() {
        this.errors = [];
        this.maxErrors = 100; // Keep last 100 errors
        this.init();
    }

    init() {
        // Listen for workflow errors
        window.addEventListener('workflowError', (event) => {
            this.collectError(event.detail);
        });

        // Listen for stage completion errors
        window.addEventListener('workflowStageCompleted', (event) => {
            this.logStageCompletion(event.detail);
        });

        // Listen for workflow completion
        window.addEventListener('workflowCompleted', (event) => {
            this.logWorkflowCompletion(event.detail);
        });

        // Expose to window for debugging
        window.workflowErrorCollector = this;
    }

    collectError(errorDetail) {
        const error = {
            ...errorDetail,
            id: this.generateErrorId(),
            collectedAt: new Date().toISOString()
        };

        this.errors.unshift(error);
        
        // Keep only the most recent errors
        if (this.errors.length > this.maxErrors) {
            this.errors = this.errors.slice(0, this.maxErrors);
        }

        // Log to console with styling
        this.logError(error);

        // Store in localStorage for persistence across sessions
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
        const errorTypeStyles = {
            'DUPLICATE_STAGE_TRANSITION': 'color: #e74c3c; background: #fadbd8; padding: 4px 8px; border-radius: 4px;',
            'DUPLICATE_STAGE_COMPLETION_IN_TEMPLATE': 'color: #c0392b; background: #f5b7b1; padding: 4px 8px; border-radius: 4px;',
            'MISSING_REQUIREMENTS': 'color: #d68910; background: #fdeaa7; padding: 4px 8px; border-radius: 4px;',
            'AI_STORE_OUT_OF_SYNC': 'color: #8e44ad; background: #e8daef; padding: 4px 8px; border-radius: 4px;',
            'PERSISTENT_TRANSITION_BLOCK': 'color: #922b21; background: #fadbd8; padding: 4px 8px; border-radius: 4px;',
            'CONDITIONS_NOT_MET': 'color: #b7950b; background: #fcf3cf; padding: 4px 8px; border-radius: 4px;',
            'RACE_CONDITION_DETECTED': 'color: #943126; background: #fadbd8; padding: 4px 8px; border-radius: 4px;'
        };

        const style = errorTypeStyles[error.error] || 'color: #e74c3c; font-weight: bold;';

        console.group(`%c🚨 WORKFLOW ERROR: ${error.error}`, style);
        console.log('Error ID:', error.id);
        console.log('Message:', error.message);
        console.log('Timestamp:', error.timestamp);
        console.log('Details:', error);
        if (error.callStack) {
            console.log('Call Stack:', error.callStack);
        }
        console.groupEnd();
    }

    generateErrorId() {
        return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    persistErrors() {
        try {
            const errorData = {
                errors: this.errors.slice(0, 20), // Store only last 20 errors
                lastUpdated: new Date().toISOString()
            };
            localStorage.setItem('workflowErrors', JSON.stringify(errorData));
        } catch (e) {
            console.warn('Failed to persist workflow errors to localStorage:', e);
        }
    }

    loadPersistedErrors() {
        try {
            const stored = localStorage.getItem('workflowErrors');
            if (stored) {
                const errorData = JSON.parse(stored);
                return errorData.errors || [];
            }
        } catch (e) {
            console.warn('Failed to load persisted workflow errors:', e);
        }
        return [];
    }

    // Debug methods
    getErrorsByType(errorType) {
        return this.errors.filter(error => error.error === errorType);
    }

    getErrorsInTimeRange(startTime, endTime) {
        const start = new Date(startTime);
        const end = new Date(endTime);
        return this.errors.filter(error => {
            const errorTime = new Date(error.timestamp);
            return errorTime >= start && errorTime <= end;
        });
    }

    getErrorStats() {
        const stats = {};
        this.errors.forEach(error => {
            stats[error.error] = (stats[error.error] || 0) + 1;
        });
        return stats;
    }

    clearErrors() {
        this.errors = [];
        localStorage.removeItem('workflowErrors');
        console.log('🧹 Workflow errors cleared');
    }

    exportErrors() {
        const exportData = {
            errors: this.errors,
            exportedAt: new Date().toISOString(),
            userAgent: navigator.userAgent,
            url: window.location.href
        };
        
        const blob = new Blob([JSON.stringify(exportData, null, 2)], {
            type: 'application/json'
        });
        
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `workflow-errors-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // Helper for analyzing duplicate stage issues
    analyzeDuplicateStageIssues() {
        const duplicateErrors = this.errors.filter(error => 
            error.error === 'DUPLICATE_STAGE_TRANSITION' || 
            error.error === 'DUPLICATE_STAGE_COMPLETION_IN_TEMPLATE'
        );

        const analysis = {
            totalDuplicates: duplicateErrors.length,
            stagesAffected: [...new Set(duplicateErrors.map(e => e.stageId || e.attemptedStage))],
            timePattern: duplicateErrors.map(e => ({ time: e.timestamp, stage: e.stageId || e.attemptedStage })),
            callStackPatterns: duplicateErrors.map(e => e.callStack?.split('\n')[1]?.trim()).filter(Boolean)
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

// Initialize the error collector
const workflowErrorCollector = new WorkflowErrorCollector();

export default workflowErrorCollector;