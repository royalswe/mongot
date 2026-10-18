export function getErrorMessage(error: unknown) {
    if (error instanceof Error) return error.message
    return String(error)
}

export const reportError = ({ message }: { message: string }) => {
    // TODO: send the error to our logging service...
    console.log('reporting error:', message);

}