/**
 * Tool Registry Service
 * Manages tool registration and retrieval
 * Implements the IToolRegistry interface
 */

import { Injectable } from '@nestjs/common';
import {
  ITool,
  IToolRegistry,
} from '../agents/core/execution-context.interface';

@Injectable()
export class ToolRegistry implements IToolRegistry {
  private tools: Map<string, ITool> = new Map();

  /**
   * Get a tool by name
   * @param name - Tool name to retrieve
   * @returns The tool if found, undefined otherwise
   */
  getTool(name: string): ITool | undefined {
    return this.tools.get(name);
  }

  /**
   * List all available tools
   * @returns Array of all registered tools
   */
  listTools(): ITool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Register a new tool
   * @param tool - The tool to register
   */
  registerTool(tool: ITool): void {
    if (this.tools.has(tool.name)) {
      console.warn(`Tool '${tool.name}' is already registered, overwriting...`);
    }
    this.tools.set(tool.name, tool);
  }

  /**
   * Check if a tool is registered
   * @param name - Tool name to check
   * @returns True if tool exists, false otherwise
   */
  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Register multiple tools at once
   * @param tools - Array of tools to register
   */
  registerTools(tools: ITool[]): void {
    for (const tool of tools) {
      this.registerTool(tool);
    }
  }

  /**
   * Clear all registered tools
   */
  clear(): void {
    this.tools.clear();
  }
}
