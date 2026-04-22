/**
 * Editable Content Manager
 * Manages versioning and history of edited content for Scenario B responses
 */

import { Injectable } from '@nestjs/common';

export interface EditVersion {
  versionId: string;
  content: string;
  editedAt: Date;
  editedBy: string;
  changeDescription?: string;
}

export interface EditableContentRecord {
  ticketId: string;
  originalContent: string;
  versions: EditVersion[];
  currentVersion: EditVersion;
  finalContent?: string;
  submitted: boolean;
}

@Injectable()
export class EditableContentManager {
  private editHistory: Map<string, EditableContentRecord> = new Map();

  /**
   * Create a new editable content record
   */
  createEditableContent(
    ticketId: string,
    originalContent: string,
  ): EditableContentRecord {
    const versionId = this.generateVersionId();
    const initialVersion: EditVersion = {
      versionId,
      content: originalContent,
      editedAt: new Date(),
      editedBy: 'system',
      changeDescription: 'Initial AI-generated content',
    };

    const record: EditableContentRecord = {
      ticketId,
      originalContent,
      versions: [initialVersion],
      currentVersion: initialVersion,
      submitted: false,
    };

    this.editHistory.set(ticketId, record);
    return record;
  }

  /**
   * Record an edit to the content
   */
  recordEdit(
    ticketId: string,
    newContent: string,
    editedBy: string,
    changeDescription?: string,
  ): EditVersion {
    const record = this.editHistory.get(ticketId);
    if (!record) {
      throw new Error(`No editable content found for ticket ${ticketId}`);
    }

    const versionId = this.generateVersionId();
    const newVersion: EditVersion = {
      versionId,
      content: newContent,
      editedAt: new Date(),
      editedBy,
      changeDescription,
    };

    record.versions.push(newVersion);
    record.currentVersion = newVersion;

    return newVersion;
  }

  /**
   * Get all versions for a ticket
   */
  getVersionHistory(ticketId: string): EditVersion[] {
    const record = this.editHistory.get(ticketId);
    if (!record) {
      throw new Error(`No editable content found for ticket ${ticketId}`);
    }

    return record.versions;
  }

  /**
   * Get the current version
   */
  getCurrentVersion(ticketId: string): EditVersion {
    const record = this.editHistory.get(ticketId);
    if (!record) {
      throw new Error(`No editable content found for ticket ${ticketId}`);
    }

    return record.currentVersion;
  }

  /**
   * Mark content as submitted/finalized
   */
  submitContent(ticketId: string): string {
    const record = this.editHistory.get(ticketId);
    if (!record) {
      throw new Error(`No editable content found for ticket ${ticketId}`);
    }

    record.submitted = true;
    record.finalContent = record.currentVersion.content;

    return record.finalContent;
  }

  /**
   * Get edit record for a ticket
   */
  getEditRecord(ticketId: string): EditableContentRecord | undefined {
    return this.editHistory.get(ticketId);
  }

  /**
   * Generate unique version ID
   */
  private generateVersionId(): string {
    return `v${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
