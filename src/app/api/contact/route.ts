import { ensureContactTable, pool } from "@/lib/db";

type ContactSubmission = {
  id: number;
  name: string;
  email: string;
  message: string;
  createdAt: string;
};

export async function GET() {
  if (!pool) {
    return Response.json(
      {
        error: "PostgreSQL is not configured. Add POSTGRES_URL to your environment.",
      },
      { status: 500 }
    );
  }

  try {
    await ensureContactTable();

    const result = await pool.query<ContactSubmission>(`
      SELECT id, name, email, message, "createdAt"
      FROM contact_submissions
      ORDER BY "createdAt" DESC
      LIMIT 20
    `);

    return Response.json({
      count: result.rows.length,
      submissions: result.rows,
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to fetch contact submissions.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  if (!pool) {
    return Response.json(
      {
        error: "PostgreSQL is not configured. Add POSTGRES_URL to your environment.",
      },
      { status: 500 }
    );
  }

  try {
    const body = (await request.json()) as {
      name?: string;
      email?: string;
      message?: string;
    };

    const { name, email, message } = body;

    if (!name || !email || !message) {
      return Response.json(
        {
          error: "Name, email, and message are all required.",
        },
        { status: 400 }
      );
    }

    await ensureContactTable();

    const result = await pool.query<ContactSubmission>(
      `
        INSERT INTO contact_submissions (name, email, message)
        VALUES ($1, $2, $3)
        RETURNING id, name, email, message, "createdAt"
      `,
      [name, email, message]
    );

    const submission = result.rows[0];

    return Response.json(
      {
        message: `Thanks, ${name}! Your message was sent successfully.`,
        data: submission,
      },
      { status: 201 }
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The request body could not be read or saved.",
      },
      { status: 400 }
    );
  }
}
