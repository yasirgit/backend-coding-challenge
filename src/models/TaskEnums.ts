export enum TaskStatus {
    Queued = 'queued',
    InProgress = 'in_progress',
    Completed = 'completed',
    Failed = 'failed',
}

export enum TaskType {
    PolygonArea = 'polygon_area',
    DataAnalysis = 'analysis',
    ReportGeneration = 'report_generation',
    EmailNotification = 'notification',
}