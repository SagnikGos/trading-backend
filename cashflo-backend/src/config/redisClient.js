// src/config/redisClient.js

class MockRedisClient {
  constructor() {
    this.store = new Map();
    this.status = 'ready';
  }

  pipeline() {
    const ops = [];
    const pipe = {
      set: (key, value, ex, expiry) => {
        ops.push(() => {
          this.store.set(key, value);
        });
        return pipe;
      },
      exec: async () => {
        ops.forEach(op => op());
        return [];
      }
    };
    return pipe;
  }

  async get(key) {
    return this.store.get(key) || null;
  }
  
  on(event, handler) {
    if (event === 'connect') {
      setTimeout(handler, 0);
    }
  }

  async quit() {
    this.status = 'end';
  }
}

const redisClient = new MockRedisClient();
export default redisClient;