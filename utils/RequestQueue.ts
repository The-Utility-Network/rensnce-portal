export class RequestQueue {
    private queue: (() => Promise<any>)[] = [];
    private pendingPromise: boolean = false;
    private delay: number = 200; // ms between requests

    enqueue<T>(request: () => Promise<T>): Promise<T> {
        return new Promise((resolve, reject) => {
            this.queue.push(async () => {
                try {
                    const result = await request();
                    resolve(result);
                } catch (error) {
                    reject(error);
                }
            });
            this.dequeue();
        });
    }

    private async dequeue() {
        if (this.pendingPromise) return;
        if (this.queue.length === 0) return;

        this.pendingPromise = true;
        const item = this.queue.shift();
        if (item) {
            try {
                await item();
            } catch (e) {
                console.error(e);
            }
        }
        await new Promise((resolve) => setTimeout(resolve, this.delay));
        this.pendingPromise = false;
        this.dequeue();
    }
}

export const requestQueue = new RequestQueue();
