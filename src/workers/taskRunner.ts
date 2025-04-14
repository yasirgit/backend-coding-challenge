import { Repository } from 'typeorm';
import { Task } from '../models/Task';
import { getJobForTaskType } from '../jobs/JobFactory';
import { WorkflowStatus } from '../workflows/WorkflowFactory';
import { Workflow } from '../models/Workflow';
import { Result } from '../models/Result';
import { TaskStatus, TaskType } from '../models/TaskEnums';
import taskQueue from '../queue/taskQueue';

export class TaskRunner {
    private readonly maxRetries = 3;

    constructor(private taskRepository: Repository<Task>) {}

    async run(task: Task): Promise<void> {
        if (!Object.values(TaskType).includes(task.taskType as TaskType)) {
            console.error(`Invalid task type encountered: ${task.taskType}`);
            throw new Error(`Invalid task type: ${task.taskType}`);
        }

        const taskRepository = this.taskRepository.manager.getRepository(Task);

        const dependentTask = await taskRepository.findOne({
            where: { taskId: task.taskId },
            relations: ['dependsOn'],
        });

        if (dependentTask?.dependsOn && dependentTask.dependsOn.status === TaskStatus.Failed) {
            task.status = TaskStatus.Failed;
            task.progress = `Dependent task ${dependentTask.dependsOn.taskId} failed.`;
            await this.taskRepository.save(task);
            return;
        }

        await taskQueue.add({ taskId: task.taskId });

        task.status = TaskStatus.InProgress;
        task.progress = 'starting job...';
        await this.taskRepository.save(task);

        const job = getJobForTaskType(task.taskType);

        try {
            console.log(`Starting job ${task.taskType} for task ${task.taskId}...`);
            const resultRepository = this.taskRepository.manager.getRepository(Result);
            const taskResult = await job.run(task);
            console.log(`Job ${task.taskType} for task ${task.taskId} completed successfully.`);

            const result = new Result();
            result.taskId = task.taskId!;
            result.data = JSON.stringify(taskResult || {});
            await resultRepository.save(result);

            task.resultId = result.resultId!;
            task.status = TaskStatus.Completed;
            task.progress = null;
            task.retryCount = 0; // Reset retry count on success
            await this.taskRepository.save(task);
        } catch (error: any) {
            console.error(`Error running job ${task.taskType} for task ${task.taskId}:`, error);

            task.retryCount += 1; // Increment retry count
            if (task.retryCount <= this.maxRetries) {
                console.log(
                    `Retrying task ${task.taskId} (attempt ${task.retryCount}/${this.maxRetries})...`
                );

                // Exponential backoff
                const delay = Math.pow(2, task.retryCount) * 1000; // 2^retryCount seconds
                await new Promise((resolve) => setTimeout(resolve, delay));

                await this.run(task); // Retry the task
            } else {
                console.error(`Task ${task.taskId} failed after ${this.maxRetries} retries.`);
                task.status = TaskStatus.Failed;
                task.progress = null;
                await this.taskRepository.save(task);
                throw error; // Rethrow the error after max retries
            }
        }

        const workflowRepository = this.taskRepository.manager.getRepository(Workflow);
        const currentWorkflow = await workflowRepository.findOne({
            where: { workflowId: task?.workflow?.workflowId },
            relations: ['tasks'],
        });

        if (currentWorkflow) {
            const totalTasks = await taskRepository.count({
                where: { workflow: { workflowId: currentWorkflow.workflowId } },
            });
        
            const completedTasks = await taskRepository.count({
                where: { workflow: { workflowId: currentWorkflow.workflowId }, status: TaskStatus.Completed },
            });
        
            const failedTasks = await taskRepository.count({
                where: { workflow: { workflowId: currentWorkflow.workflowId }, status: TaskStatus.Failed },
            });
        
            if (failedTasks > 0) {
                currentWorkflow.status = WorkflowStatus.Failed;
            } else if (completedTasks === totalTasks) {
                currentWorkflow.status = WorkflowStatus.Completed;
            } else {
                currentWorkflow.status = WorkflowStatus.InProgress;
            }
        
            await workflowRepository.save(currentWorkflow);

            const workflowTasks = currentWorkflow.tasks;
            for (const workflowTask of workflowTasks) {
                if (
                    workflowTask.status === TaskStatus.Queued &&
                    (!workflowTask.dependsOn || workflowTask.dependsOn.status === TaskStatus.Completed)
                ) {
                    await taskQueue.add({ taskId: workflowTask.taskId });
                }
            }
        
            const nextTask = await taskRepository.findOne({
                where: {
                    workflow: { workflowId: currentWorkflow.workflowId },
                    stepNumber: task.stepNumber + 1,
                    status: TaskStatus.Queued,
                },
            });
        
            if (nextTask) {
                await this.run(nextTask);
            }
        }
    }

    async startWorkflow(workflow: Workflow): Promise<void> {
        const taskRepository = this.taskRepository.manager.getRepository(Task);
    
        // Fetch all tasks associated with the workflow
        const workflowTasks = await taskRepository.find({
            where: { workflow: { workflowId: workflow.workflowId } },
            relations: ['dependsOn'],
        });
    
        // Queue all tasks that are ready to run (no dependencies or dependencies completed)
        for (const task of workflowTasks) {
            if (
                task.status === TaskStatus.Queued &&
                (!task.dependsOn || task.dependsOn.status === TaskStatus.Completed)
            ) {
                await taskQueue.add({ taskId: task.taskId });
            }
        }
    
        // Update workflow status to InProgress
        const workflowRepository = this.taskRepository.manager.getRepository(Workflow);
        workflow.status = WorkflowStatus.InProgress;
        await workflowRepository.save(workflow);
    
        console.log(`Workflow ${workflow.workflowId} started.`);
    }
}