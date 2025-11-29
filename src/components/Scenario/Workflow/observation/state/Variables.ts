export class Variables {
  private _data: Record<string, any>;

  constructor(data: Record<string, any>) {
    this._data = data;
  }

  public get(key: string): any {
    return this._data[key];
  }

  public getAll(): Record<string, any> {
    return this._data;
  }

  public set(key: string, value: any): void {
    this._data[key] = value;
  }

  public update(variables: Record<string, any>): void {
    this._data = { ...this._data, ...variables };
  }

  public delete(key: string): void {
    delete this._data[key];
  }

  public toJSON(): Record<string, any> {
    return JSON.parse(JSON.stringify(this._data));
  }
}
