
export interface Variables { // If minimum and maximum are -1, they are ignored
    name: string;
    value: number | number[];
    text: string;
    minimum: number;
    maximum: number;
    input: boolean
};

export interface FileObject {
    name: string;
    header: string;
}