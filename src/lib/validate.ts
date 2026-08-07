// Input validators for the init wizard. Each returns the normalized value, or
// an Error describing what to fix (never throws) so the prompt loop can re-ask.

export function validateEmail(input: string): string | Error {
  const email = input.trim().toLowerCase()
  // Deliberately loose: one @, a dot in the domain. Real verification is a
  // mailed code (planned), not a stricter regex.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return new Error('That does not look like an email address.')
  }
  return email
}

export function validateCompany(input: string): string | Error {
  const company = input.trim()
  if (company.length === 0) return new Error('Company name cannot be empty.')
  if (company.length > 200) return new Error('Company name is too long.')
  return company
}

export function validateDeveloperCount(input: string): number | Error {
  const n = Number(input.trim().replace(/,/g, ''))
  if (!Number.isInteger(n) || n < 1 || n > 1_000_000) {
    return new Error('Enter a whole number of developers, e.g. 45.')
  }
  return n
}

export function validateAwsAccountId(input: string): string | Error {
  const id = input.trim().replace(/-/g, '')
  if (!/^\d{12}$/.test(id)) {
    return new Error('An AWS account ID is 12 digits, e.g. 977461612411.')
  }
  return id
}

export function validateDomain(input: string): string | Error {
  const domain = input.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '')
  if (!/^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
    return new Error('That does not look like a domain, e.g. ellipsis.acme.com.')
  }
  return domain
}

export function validateGithubOrg(input: string): string | Error {
  let org = input.trim()
  // Accept a pasted URL and strip it down to the login.
  org = org.replace(/^https?:\/\/(www\.)?github\.com\//i, '')
  org = org.replace(/\/+$/, '')
  if (org.length === 0) return new Error('GitHub organization cannot be empty.')
  if (org.includes('/')) {
    return new Error('Enter just the organization login, not a repository path.')
  }
  if (!/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(org) || org.length > 39) {
    return new Error('That does not look like a GitHub organization login.')
  }
  return org
}
