// The customer-facing install checklist: shown in full after the welcome, and
// re-rendered with progress after each completed step. One entry per wizard
// step, each with the rough time it takes — the honest expectation-setter for
// the "about two hours" promise in the welcome copy.
export interface InstallStep {
  title: string
  detail: string
  minutes: string
}

export const INSTALL_STEPS: InstallStep[] = [
  {
    title: 'Start your free trial',
    detail: 'Tell us who you are. No credit card required.',
    minutes: '2 min',
  },
  {
    title: 'Connect GitHub',
    detail: "Create your company's own GitHub App (one click) and install it on your organization.",
    minutes: '10 min',
  },
  {
    title: 'Deploy Ellipsis into your AWS account',
    detail: 'We check your account is ready, then provision the platform with CloudFormation.',
    minutes: '~75 min, mostly waiting on AWS',
  },
  {
    title: 'Connect Slack (optional)',
    detail: 'Let agents answer questions and post updates in your workspace.',
    minutes: '5 min',
  },
  {
    title: 'Choose how agents reach models',
    detail: 'Use Ellipsis-managed access (default), or bring your own Anthropic key or AWS Bedrock.',
    minutes: '5 min',
  },
  {
    title: 'Verify and run your first agent',
    detail: 'Health-check the installation, then watch a code review land on a real pull request.',
    minutes: '10 min',
  },
]

export function renderChecklist(completedThrough: number): string {
  const lines = INSTALL_STEPS.map((step, i) => {
    const box = i < completedThrough ? '[x]' : '[ ]'
    return `  ${box} Step ${i + 1}: ${step.title} (${step.minutes})`
  })
  return lines.join('\n')
}
