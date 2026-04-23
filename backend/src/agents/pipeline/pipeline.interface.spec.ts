/// <reference types="jest" />

/**
 * Unit tests for the pipeline validator.  The data contracts themselves
 * are compile-time only; what has runtime behaviour is
 * `assertValidPipeline` which guards the orchestrator against
 * malformed pipelines.
 */

import {
  AgentPipeline,
  InvalidPipelineError,
  assertValidPipeline,
} from './pipeline.interface';
import { IAgent } from '../core/agent.interface';

const stubAgent: IAgent = {
  name: 'stub',
  description: 'stub agent for tests',
  async execute() {
    return {
      success: true,
      output: null,
      iterations: 0,
    };
  },
};

function makePipeline(
  overrides: Partial<AgentPipeline> = {},
  routeOverrides: Partial<AgentPipeline['routes'][number]>[] = [],
): AgentPipeline {
  const defaultRoutes: AgentPipeline['routes'] =
    routeOverrides.length > 0
      ? routeOverrides.map((r, i) => ({
          id: `r${i}`,
          agent: stubAgent,
          ...r,
        }))
      : [{ id: 'a', agent: stubAgent }];

  return {
    id: 'test-pipeline',
    description: 'test',
    routes: defaultRoutes,
    ...overrides,
  };
}

describe('assertValidPipeline', () => {
  test('accepts a well-formed single-route pipeline', () => {
    expect(() => assertValidPipeline(makePipeline())).not.toThrow();
  });

  test('accepts a multi-route pipeline with unique ids', () => {
    const pipeline = makePipeline({}, [{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    expect(() => assertValidPipeline(pipeline)).not.toThrow();
  });

  test('rejects an empty pipeline id', () => {
    const pipeline = makePipeline({ id: '' });
    expect(() => assertValidPipeline(pipeline)).toThrow(InvalidPipelineError);
  });

  test('rejects a pipeline with no routes', () => {
    const pipeline = makePipeline({ routes: [] });
    expect(() => assertValidPipeline(pipeline)).toThrow(/non-empty/);
  });

  test('rejects a route with missing id', () => {
    const pipeline = makePipeline({}, [{ id: '', agent: stubAgent }]);
    expect(() => assertValidPipeline(pipeline)).toThrow(/missing an id/);
  });

  test('rejects duplicate route ids', () => {
    const pipeline = makePipeline({}, [{ id: 'dup' }, { id: 'dup' }]);
    expect(() => assertValidPipeline(pipeline)).toThrow(/duplicate route id/);
  });

  test('rejects a route missing a valid agent', () => {
    const pipeline = makePipeline({}, [
      { id: 'bad', agent: undefined as unknown as IAgent },
    ]);
    expect(() => assertValidPipeline(pipeline)).toThrow(
      /missing a valid agent/,
    );
  });

  test('rejects a non-positive timeoutMs', () => {
    const pipeline = makePipeline({}, [{ id: 'x', timeoutMs: 0 }]);
    expect(() => assertValidPipeline(pipeline)).toThrow(/invalid timeoutMs/);
  });

  test('rejects a negative retries value', () => {
    const pipeline = makePipeline({}, [{ id: 'x', retries: -1 }]);
    expect(() => assertValidPipeline(pipeline)).toThrow(/invalid retries/);
  });

  test('accepts explicit timeoutMs and retries when valid', () => {
    const pipeline = makePipeline({}, [
      { id: 'x', timeoutMs: 5000, retries: 2 },
    ]);
    expect(() => assertValidPipeline(pipeline)).not.toThrow();
  });

  test('exposes pipelineId on thrown errors for diagnostics', () => {
    try {
      assertValidPipeline(makePipeline({ routes: [] }));
      fail('expected assertValidPipeline to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidPipelineError);
      expect((err as InvalidPipelineError).pipelineId).toBe('test-pipeline');
    }
  });
});
