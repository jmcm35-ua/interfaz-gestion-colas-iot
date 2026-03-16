export interface PriorityQueue {
    weight: number;
};

export interface Variables { // If minimum and maximum are -1, they are ignored
    name: string;
    value: number | PriorityQueue[];
    text: string;
    minimum: number;
    maximum: number;
    input: boolean
};

export interface FileItem {
    id: string | number;
    name: string;
    url: string;
}