export default abstract class BaseEntity extends Object {
  /**
   * 判断两个实体是否相等
   * @param {BaseEntity} other 另一个实体
   * @returns {boolean} 是否相等
   */
  equals(other: BaseEntity): boolean {
    if (this === other) return true;
    if (other == null || this.constructor !== other.constructor) return false;

    const thisProps = Object.getOwnPropertyNames(this);
    const otherProps = Object.getOwnPropertyNames(other);

    if (thisProps.length !== otherProps.length) {
      return false;
    }

    for (let prop of thisProps) {
      if ((this as any)[prop] !== (other as any)[prop]) {
        return false;
      }
    }

    return true;
  }

  /**
   * 生成对象的哈希码
   * @returns {number} 哈希码
   */
  hashCode(): number {
    const str = JSON.stringify(this);
    let hash = 0;

    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0; // Convert to 32bit integer
    }

    return hash;
  }

  /**
   * 返回对象的字符串表示
   * @returns {string} 对象的字符串表示
   */
  toString(): string {
    return JSON.stringify(this);
  }

  /**
   * 克隆当前对象
   * @returns {BaseEntity} 克隆后的对象
   */
  clone(): BaseEntity {
    return Object.assign(Object.create(Object.getPrototypeOf(this)), this);
  }

  /**
   * 比较当前对象与另一个对象，返回一个数字，表示它们的排序关系
   * @param other 另一个实体
   * @returns
   */
  compareTo(other: BaseEntity): number {
    const thisStr = this.toString();
    const otherStr = other.toString();

    if (thisStr < otherStr) return -1;
    if (thisStr > otherStr) return 1;
    return 0;
  }

  /**
   *  将当前实体的字段更新为另一个实体的字段
   * @param other 另一个实体
   */
  updateFields(other: BaseEntity): void {
    if (this.constructor !== other.constructor) {
      throw new Error("Cannot update fields from a different entity type");
    }

    const props = Object.getOwnPropertyNames(this);
    for (let prop of props) {
      (this as any)[prop] = (other as any)[prop];
    }
  }

  /**
   * 获取实体的所有字段名
   * @returns 返回实体的所有字段名
   */
  getFieldNames(): string[] {
    return Object.keys(this);
  }

  /**
   * 获取实体的所有字段值
   * @returns 返回实体的所有字段值
   */
  getFieldValues(): any[] {
    return Object.values(this);
  }

  /**
   * 获取实体的指定字段值
   * @param fieldName 字段名
   * @returns
   */
  getFieldValue(fieldName: string): any {
    if (this.hasOwnProperty(fieldName)) {
      return (this as any)[fieldName];
    }
    throw new Error(`Field ${fieldName} does not exist`);
  }

  /**
   * 设置实体的指定字段值
   * @param fieldName 字段名
   * @param value
   */
  setFieldValue(fieldName: string, value: any): void {
    if (this.hasOwnProperty(fieldName)) {
      (this as any)[fieldName] = value;
    } else {
      throw new Error(`Field ${fieldName} does not exist`);
    }
  }
}
