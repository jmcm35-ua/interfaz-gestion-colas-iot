
export interface Variables {    // Si el mínimo o máximo son -1, se ignoran
    name: string;               // Nombre con la que se le identifica en el Worker
    value: number | number[];   // Valor actual
    text: string;               // Definición 
    minimum: number;            // Mínimo posible
    maximum: number;            // Máximo posible
    input: boolean              // Si es editable
};

export interface FileObject {
    name: string;
    header: string;
}