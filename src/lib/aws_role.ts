// The cross-account deploy role: the quick-create link the customer's AWS
// admin clicks, and the console links around its lifecycle. The CLI holds NO
// AWS credentials — role creation and deletion happen in the customer's own
// console (their admin, their review, their click); the license service
// verifies creation by actually assuming the role.

// Our operator identity. Every customer trust policy pins to this exact ARN,
// so it is permanent (see the license CDK stack: ellipsis-byoc-operator).
export const OPERATOR_ROLE_ARN = 'arn:aws:iam::977461612411:role/ellipsis-byoc-operator'

// Versioned, immutable template key in the public ellipsis-byoc-templates
// bucket. A template change is a NEW key + a CLI release pointing at it —
// never a mutation under a shipped CLI.
export const DEPLOY_ROLE_TEMPLATE_URL =
  'https://ellipsis-byoc-templates.s3.us-east-1.amazonaws.com/templates/deploy-role/v1.yaml'

// The stack must live in some region even though IAM is global; us-east-1 by
// decision, matching where the platform stack deploys.
export const ROLE_STACK_REGION = 'us-east-1'

export const ROLE_STACK_NAME = 'ellipsis-deploy-access'

/**
 * The CloudFormation quick-create URL: a prefilled "Create stack" console
 * page. Parameters ride the query string (param_<Name>), so the role is born
 * bound to this deployment's id (the ExternalId — confused-deputy
 * protection).
 */
export function quickCreateUrl(deploymentId: string): string {
  const params = new URLSearchParams({
    templateURL: DEPLOY_ROLE_TEMPLATE_URL,
    stackName: ROLE_STACK_NAME,
    param_OperatorRoleArn: OPERATOR_ROLE_ARN,
    param_ExternalId: deploymentId,
  })
  return (
    `https://console.aws.amazon.com/cloudformation/home?region=${ROLE_STACK_REGION}` +
    `#/stacks/quickcreate?${params.toString()}`
  )
}

/** The console page listing the role stack — where the customer deletes it. */
export function stackConsoleUrl(): string {
  return (
    `https://console.aws.amazon.com/cloudformation/home?region=${ROLE_STACK_REGION}` +
    `#/stacks?filteringText=${ROLE_STACK_NAME}`
  )
}
