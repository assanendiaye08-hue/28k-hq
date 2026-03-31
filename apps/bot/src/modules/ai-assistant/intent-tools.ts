/**
 * Tool definitions for LLM-driven intent detection.
 *
 * These tools are passed to the AI model via the tools parameter.
 * When the LLM detects an actionable intent in the user's message,
 * it calls the appropriate tool instead of responding with plain text.
 *
 * Each tool description is carefully worded to minimize false positives:
 * the LLM should only invoke a tool when the user's message clearly
 * matches the described intent pattern.
 */

import type { ToolDefinition } from '../../shared/ai-types.js';

/**
 * Tool definitions for all natural language actions.
 *
 * Passed to callAI via AICallOptions.tools when processing DM messages.
 * The LLM decides whether to invoke a tool based on message content.
 */
export const intentTools: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'log_checkin',
      description:
        'Log a daily check-in when the user reports what they accomplished or worked on today. ' +
        'Only call this when the user is clearly describing completed work or progress, not when ' +
        'they are asking questions, making plans, or chatting casually.',
      parameters: {
        type: 'object',
        properties: {
          activity: {
            type: 'string',
            description: 'What the user accomplished or worked on',
          },
          effort: {
            type: 'number',
            description: 'Effort rating from 1-5, only if the user mentions how hard they worked',
          },
        },
        required: ['activity'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_goal',
      description:
        'Create a new goal when the user expresses wanting to achieve something specific. ' +
        'Look for phrases like "I want to", "my goal is", "I aim to", "I need to achieve". ' +
        'Do NOT call this for casual mentions of wanting things or vague wishes without a clear objective. ' +
        'Always infer the timeframe from the deadline context.',
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'The goal title, concise and actionable',
          },
          deadline: {
            type: 'string',
            description: 'When to achieve it, in natural language (e.g., "Friday", "end of month", "2 weeks")',
          },
          target: {
            type: 'number',
            description: 'Target number for measurable goals (e.g., 5 for "5 cold emails")',
          },
          unit: {
            type: 'string',
            description: 'Unit of measurement (e.g., "emails", "pages", "commits")',
          },
          timeframe: {
            type: 'string',
            enum: ['YEARLY', 'QUARTERLY', 'MONTHLY', 'WEEKLY'],
            description:
              'Goal timeframe -- infer from context: "this quarter" or "by end of Q2" = QUARTERLY, ' +
              '"this month" or "by end of April" = MONTHLY, "this week" or "by Friday" = WEEKLY, ' +
              '"this year" or "by December" = YEARLY. If deadline spans multiple months use QUARTERLY. ' +
              'If deadline is within 7 days use WEEKLY. If no clear signal, omit.',
          },
          parentGoalTitle: {
            type: 'string',
            description:
              'Title of an existing higher-level goal this new goal contributes to. ' +
              'Only set this when the user explicitly mentions connecting to an existing goal, ' +
              'e.g. "under my revenue goal" or "as part of Build a SaaS". Use the goal title as-is.',
          },
        },
        required: ['title', 'deadline'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_reminder',
      description:
        'Set a reminder when the user asks to be reminded about something at a specific time. ' +
        'Look for phrases like "remind me", "set a reminder", "don\'t let me forget". ' +
        'Do NOT call this when the user is asking about existing reminders or discussing the concept of reminders.',
      parameters: {
        type: 'object',
        properties: {
          content: {
            type: 'string',
            description: 'What to remind them about',
          },
          time: {
            type: 'string',
            description: 'When to remind them, in natural language (e.g., "tomorrow at 9am", "in 2 hours", "Monday at 3pm")',
          },
          recurring: {
            type: 'string',
            description: 'Recurrence pattern if the user wants a repeating reminder (e.g., "every Monday", "every day", "every weekday")',
          },
        },
        required: ['content', 'time'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'track_commitment',
      description:
        'Track a commitment when the user says they will do something by a specific time. ' +
        'Look for statements like "I will", "I\'ll have", "I\'m going to", "I promise to" with a deadline. ' +
        'Do NOT call this for vague statements without a clear deliverable and timeline.',
      parameters: {
        type: 'object',
        properties: {
          what: {
            type: 'string',
            description: 'What the user is committing to do',
          },
          by_when: {
            type: 'string',
            description: 'The deadline for the commitment, in natural language',
          },
        },
        required: ['what', 'by_when'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'start_brainstorm',
      description:
        'Start a structured brainstorming session when the user explicitly asks to brainstorm, ' +
        'explore ideas, or think through a problem creatively. ' +
        'Look for phrases like "let\'s brainstorm", "help me brainstorm", "I need ideas for". ' +
        'Do NOT call this for general questions or casual conversation about ideas.',
      parameters: {
        type: 'object',
        properties: {
          topic: {
            type: 'string',
            description: 'The topic or problem to brainstorm about',
          },
        },
        required: ['topic'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_goal',
      description:
        'Edit an existing goal when the user wants to change its title, deadline, or target. ' +
        'Look for phrases like "change my goal", "update the deadline", "rename my goal", ' +
        '"push back the deadline", "extend my goal". ' +
        'Do NOT call this for creating new goals or updating progress.',
      parameters: {
        type: 'object',
        properties: {
          goalTitle: {
            type: 'string',
            description: 'Current title or partial match of the goal to edit',
          },
          newTitle: {
            type: 'string',
            description: 'New title, only if the user wants to rename',
          },
          newDeadline: {
            type: 'string',
            description: 'New deadline in natural language, only if changing deadline',
          },
          newTarget: {
            type: 'number',
            description: 'New target value, only if changing the target',
          },
        },
        required: ['goalTitle'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_goal',
      description:
        'Delete or archive a goal when the user explicitly wants to remove it. ' +
        'Look for phrases like "delete my goal", "remove that goal", "cancel the goal", ' +
        '"I don\'t want that goal anymore". ' +
        'Do NOT call this for completing goals -- those should be marked complete, not deleted.',
      parameters: {
        type: 'object',
        properties: {
          goalTitle: {
            type: 'string',
            description: 'Title or partial match of the goal to delete',
          },
        },
        required: ['goalTitle'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_goals',
      description:
        'Show the user their current goals when they ask to see them. ' +
        'Look for phrases like "show my goals", "what are my goals", "list my goals", ' +
        '"how are my goals going", "goal status". ' +
        'Do NOT call this for creating or editing goals.',
      parameters: {
        type: 'object',
        properties: {
          timeframe: {
            type: 'string',
            enum: ['YEARLY', 'QUARTERLY', 'MONTHLY', 'WEEKLY', 'ALL'],
            description: 'Filter by timeframe if the user specifies one, otherwise use ALL',
          },
        },
        required: [],
      },
    },
  },
];
