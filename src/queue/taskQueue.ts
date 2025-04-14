import Bull from 'bull';
import { Task } from '../models/Task';
import { TaskRunner } from '../workers/taskRunner';
import { AppDataSource } from '../data-source';

const taskQueue = new Bull('taskQueue', {
    redis: {
        host: '127.0.0.1',
        port: 6379,
    },
});

// Process tasks in the queue
taskQueue.process(async (job) => {
    const taskRepository = AppDataSource.getRepository(Task);
    const taskRunner = new TaskRunner(taskRepository);

    const task = await taskRepository.findOne({
        where: { taskId: job.data.taskId },
        relations: ['dependsOn', 'workflow'],
    });

    if (!task) {
        throw new Error(`Task not found: ${job.data.taskId}`);
    }

    await taskRunner.run(task);
});

export default taskQueue;