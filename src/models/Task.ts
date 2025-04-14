import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { Workflow } from './Workflow';
import { TaskStatus, TaskType } from './TaskEnums';

@Entity({ name: 'tasks' })
export class Task {
    @PrimaryGeneratedColumn('uuid')
    taskId!: string;

    @Column()
    clientId!: string;

    @Column('text')
    geoJson!: string;

    @Column()
    status!: TaskStatus;

    @Column({ nullable: true, type: 'text' })
    progress?: string | null;

    @Column({ nullable: true })
    resultId?: string;

    @Column()
    taskType!: TaskType;

    @Column({ default: 1 })
    stepNumber!: number;

    @ManyToOne(() => Workflow, workflow => workflow.tasks)
    workflow!: Workflow;

    @Column('simple-json', { nullable: true })
    output?: any;

    @Column({ default: 0 })
    retryCount!: number;

    @ManyToOne(() => Task, task => task.dependentTasks, { nullable: true })
    dependsOn?: Task | null;

    @OneToMany(() => Task, task => task.dependsOn)
    dependentTasks?: Task[];
}