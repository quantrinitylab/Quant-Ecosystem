import { describe, it, expect } from 'vitest';
import { unwrapToolCallResponse } from '../QuantyCopilotDrawer';

describe('unwrapToolCallResponse', () => {
  it('returns plain text untouched', () => {
    const text = 'Subject: Hello\n\nDear Team,\n\nHere is an update.\n\nBest regards,';
    expect(unwrapToolCallResponse(text)).toBe(text);
  });

  it('unwraps a tool_call envelope and returns the body argument', () => {
    const text =
      'tool_call {"name": "compose", "arguments": {"body": "Dear Team,\\n\\nHere is an update."}}';
    expect(unwrapToolCallResponse(text)).toBe('Dear Team,\n\nHere is an update.');
  });

  it('joins ordered email parts from arguments', () => {
    const text =
      'tool_call {"name": "compose", "arguments": {"subject": "Q3 Update", "greeting": "Hi all,", "body": "Milestones on track.", "closing": "Thanks."}}';
    expect(unwrapToolCallResponse(text)).toBe('Q3 Update\n\nHi all,\n\nMilestones on track.\n\nThanks.');
  });

  it('handles stringified arguments', () => {
    const text =
      'tool_call {"name": "compose", "arguments": "{\\"body\\": \\"Hello there.\\"}"}';
    expect(unwrapToolCallResponse(text)).toBe('Hello there.');
  });

  it('strips the marker when JSON is unparseable', () => {
    const text = 'tool_call {not valid json} Some prose after.';
    const result = unwrapToolCallResponse(text);
    expect(result).not.toContain('tool_call');
    expect(result).toContain('Some prose after.');
  });

  it('handles envelope with surrounding prose', () => {
    const text =
      'Here is your draft:\ntool_call {"name": "compose", "arguments": {"body": "Dear Sir,"}}';
    expect(unwrapToolCallResponse(text)).toBe('Dear Sir,');
  });
});
