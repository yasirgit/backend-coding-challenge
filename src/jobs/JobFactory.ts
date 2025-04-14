import { Job } from './Job';
import { DataAnalysisJob } from './DataAnalysisJob';
import { EmailNotificationJob } from './EmailNotificationJob';
import { PolygonAreaJob } from './PolygonAreaJob';
import { ReportGenerationJob } from './ReportGenerationJob';
import { TaskType } from '../models/TaskEnums';

const jobMap: Record<string, () => Job> = {
    [TaskType.DataAnalysis]: () => new DataAnalysisJob(),
    [TaskType.EmailNotification]: () => new EmailNotificationJob(),
    [TaskType.PolygonArea]: () => new PolygonAreaJob(),
    [TaskType.ReportGeneration]: () => new ReportGenerationJob(),
};

export function getJobForTaskType(taskType: string): Job {
    const jobFactory = jobMap[taskType];
    if (!jobFactory) {
        throw new Error(`No job found for task type: ${taskType}`);
    }
    return jobFactory();
}