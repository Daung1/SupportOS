/**
 * Tech Assignment Manager
 * Manages bug reports and tech department assignments for Scenario C
 */

import { Injectable } from '@nestjs/common';

export interface BugReport {
  id: string;
  ticketId: string;
  title: string;
  description: string;
  errorLog?: string;
  steps?: string[];
  expectedBehavior?: string;
  actualBehavior?: string;
  environment: {
    os?: string;
    appVersion?: string;
    userAgent?: string;
  };
  severity: 'low' | 'medium' | 'high' | 'critical';
  createdAt: Date;
}

export interface TechAssignment {
  id: string;
  ticketId: string;
  bugReport: BugReport;
  assignedTo: string;
  status: 'new' | 'acknowledged' | 'in_progress' | 'resolved' | 'closed';
  dueDate: Date;
  createdAt: Date;
  updatedAt: Date;
  internalNotes?: string;
  customerEmail: {
    to: string;
    subject: string;
    body: string;
    sentAt?: Date;
  };
}

@Injectable()
export class TechAssignmentManager {
  private assignments: Map<string, TechAssignment> = new Map();

  /**
   * Create a bug report from ticket content
   */
  createBugReport(
    ticketId: string,
    content: string,
    metadata: {
      os?: string;
      appVersion?: string;
      userAgent?: string;
    } = {},
  ): BugReport {
    // Extract common patterns from the content
    const lines = content.split('\n');
    
    // Try to find error patterns
    let errorLog = '';
    let title = 'User Reported Issue';

    const lowerForDetect = content.toLowerCase();

    // Look for common error indicators
    if (lowerForDetect.includes('error')) {
      const errorMatch = content.match(/Error:\s*(.+)/i);
      if (errorMatch) {
        errorLog = errorMatch[1];
        title = `Error: ${errorMatch[1].substring(0, 50)}`;
      }
    }

    if (lowerForDetect.includes('crash')) {
      title = 'Application Crash';
    }

    if (
      lowerForDetect.includes('freeze') ||
      lowerForDetect.includes('frozen') ||
      lowerForDetect.includes('hang') ||
      lowerForDetect.includes('stuck')
    ) {
      title = 'Application Freeze/Hang';
    }

    const bugReport: BugReport = {
      id: this.generateId('bug'),
      ticketId,
      title,
      description: content,
      errorLog: errorLog || undefined,
      environment: metadata,
      severity: this.calculateSeverity(content),
      createdAt: new Date(),
    };

    return bugReport;
  }

  /**
   * Create a tech assignment
   */
  createAssignment(
    ticketId: string,
    bugReport: BugReport,
    customerEmail: string,
    assignedTo: string = 'tech-team-1',
  ): TechAssignment {
    const dueDate = this.calculateDueDate(); // 7 business days
    const assignmentId = this.generateId('assign');

    const assignment: TechAssignment = {
      id: assignmentId,
      ticketId,
      bugReport,
      assignedTo,
      status: 'new',
      dueDate,
      createdAt: new Date(),
      updatedAt: new Date(),
      customerEmail: {
        to: customerEmail,
        subject: `We've received your technical issue - Ticket #${ticketId}`,
        body: this.generateCustomerEmail(ticketId, bugReport),
      },
    };

    this.assignments.set(assignmentId, assignment);
    return assignment;
  }

  /**
   * Get assignment by ID
   */
  getAssignment(assignmentId: string): TechAssignment | undefined {
    return this.assignments.get(assignmentId);
  }

  /**
   * Get assignment by ticket ID
   */
  getAssignmentByTicket(ticketId: string): TechAssignment | undefined {
    for (const assignment of this.assignments.values()) {
      if (assignment.ticketId === ticketId) {
        return assignment;
      }
    }
    return undefined;
  }

  /**
   * Update assignment status
   */
  updateStatus(
    assignmentId: string,
    status: 'acknowledged' | 'in_progress' | 'resolved' | 'closed',
  ): TechAssignment {
    const assignment = this.assignments.get(assignmentId);
    if (!assignment) {
      throw new Error(`Assignment ${assignmentId} not found`);
    }

    assignment.status = status;
    assignment.updatedAt = new Date();

    return assignment;
  }

  /**
   * Add internal notes to assignment
   */
  addInternalNote(assignmentId: string, note: string): TechAssignment {
    const assignment = this.assignments.get(assignmentId);
    if (!assignment) {
      throw new Error(`Assignment ${assignmentId} not found`);
    }

    assignment.internalNotes = (assignment.internalNotes || '') + '\n' + note;
    assignment.updatedAt = new Date();

    return assignment;
  }

  /**
   * Calculate severity from content
   */
  private calculateSeverity(
    content: string,
  ): 'low' | 'medium' | 'high' | 'critical' {
    const lowerContent = content.toLowerCase();

    if (lowerContent.includes('data loss')) {
      return 'critical';
    }

    if (
      lowerContent.includes('cannot login') ||
      lowerContent.includes('cannot log in') ||
      lowerContent.includes('locked out')
    ) {
      return 'high';
    }

    if (
      lowerContent.includes('crash') ||
      lowerContent.includes('error') ||
      lowerContent.includes('exception')
    ) {
      return 'high';
    }

    if (
      lowerContent.includes('slow') ||
      lowerContent.includes('lag') ||
      lowerContent.includes('freeze') ||
      lowerContent.includes('stuck')
    ) {
      return 'medium';
    }

    return 'medium';
  }

  /**
   * Calculate due date (7 business days from now)
   */
  private calculateDueDate(): Date {
    const now = new Date();
    let businessDays = 0;
    const dueDate = new Date(now);

    while (businessDays < 7) {
      dueDate.setDate(dueDate.getDate() + 1);

      // Skip weekends (0 = Sunday, 6 = Saturday)
      if (dueDate.getDay() !== 0 && dueDate.getDay() !== 6) {
        businessDays++;
      }
    }

    return dueDate;
  }

  /**
   * Generate customer email
   */
  private generateCustomerEmail(ticketId: string, bugReport: BugReport): string {
    const dueDateStr = bugReport.createdAt
      ? new Date(bugReport.createdAt.getTime() + 7 * 24 * 60 * 60 * 1000)
          .toLocaleDateString()
      : 'within 7 business days';

    return `Dear Valued Customer,

Thank you for reporting this technical issue. We take your feedback seriously and have forwarded your report to our technical team for investigation.

**Issue Summary:**
${bugReport.title}

**Ticket Number:** #${ticketId}
**Severity:** ${bugReport.severity.toUpperCase()}
**Reported At:** ${bugReport.createdAt?.toLocaleString()}
**Expected Response:** ${dueDateStr}

Our technical team will investigate the issue and provide you with an update within 7 business days. In the meantime, if you have any additional information or workarounds that help with the issue, please reply to this ticket.

Thank you for your patience!

Best regards,
Support Team`;
  }

  /**
   * Generate unique IDs
   */
  private generateId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
