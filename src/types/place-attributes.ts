export interface AttributeCategory {
  id: string;
  name: string;
  icon?: string;
  attributes: Attribute[];
}

export interface Attribute {
  id: string;
  name: string;
  category: string;
  icon?: string;
  description?: string;
  valueType?: 'boolean' | 'enum' | 'string' | 'number';
}
