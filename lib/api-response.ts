import { NextResponse } from "next/server";

export interface ApiResponse<T = any> {
    success: boolean;
    message?: string;
    error?: string;
    data?: T;
}

/**
 * Returns a standard successful JSON response
 */
export function successResponse<T>(data?: T, message?: string, status = 200) {
    const body: ApiResponse<T> = { success: true };
    if (message) body.message = message;
    if (data !== undefined) body.data = data;

    return NextResponse.json(body, { status });
}

/**
 * Returns a standard error JSON response
 */
export function errorResponse(error: string, status = 400) {
    return NextResponse.json(
        { success: false, error },
        { status }
    );
}

/**
 * Wraps an API route handler to catch any unhandled errors and guarantee a JSON response,
 * preventing Next.js HTML error pages.
 */
export function withErrorHandler(handler: (req: Request, ...args: any[]) => Promise<NextResponse>) {
    return async (req: Request, ...args: any[]) => {
        try {
            return await handler(req, ...args);
        } catch (error: any) {
            console.error(`[API Error] ${req.url}:`, error);

            // Do not leak internal stack traces to the client
            return errorResponse(
                error?.message || "An unexpected error occurred during processing.",
                error?.status || error?.statusCode || 500
            );
        }
    };
}
