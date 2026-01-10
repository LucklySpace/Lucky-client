
import * as SparkMD5 from 'spark-md5';

/**
 * 加密工具
 */
export default function useCrypo() {

    /**
     * 计算文件的 md5
     * @param file 文件
     * @returns md5
     */
    const md5 = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const spark = new SparkMD5.ArrayBuffer();
            const fileReader = new FileReader();

            fileReader.onload = (e) => {
                if (e.target?.result instanceof ArrayBuffer) {
                    spark.append(e.target.result);
                    resolve(spark.end());
                } else {
                    reject("读取文件失败");
                }
            };

            fileReader.onerror = () => reject("文件读取错误");
            fileReader.readAsArrayBuffer(file);
        });
    }
    

    return { md5 }
}