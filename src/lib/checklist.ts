// The install checklist, shown after the welcome and re-rendered with status
// after each completed step. Steps are still being designed; add them here as
// they land in the wizard.
export const INSTALL_STEPS = [
  'Start free trial',
  'Deploy Ellipsis into your AWS account',
  'Connect GitHub',
  'Connect Slack (optional)',
  'Verify your installation',
] as const

export function renderChecklist(completedThrough: number): string {
  const lines = INSTALL_STEPS.map((step, i) => {
    const box = i < completedThrough ? '[x]' : '[ ]'
    return `  ${box} Step ${i + 1}: ${step}`
  })
  return lines.join('\n')
}
