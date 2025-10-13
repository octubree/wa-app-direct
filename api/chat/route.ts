
import { NextRequest, NextResponse } from 'next/server';

// Suponiendo que tienes una forma de obtener el usuario autenticado.
// Esto es un ejemplo y puede que necesites adaptarlo a tu sistema de autenticación.
async function getAuthenticatedUser(req: NextRequest) {
    // Aquí iría tu lógica para obtener el usuario.
    // Por ejemplo, a partir de un token en las cabeceras.
    // A efectos de este ejemplo, devolvemos un usuario simulado.
    return { id: 'user_123', name: 'John Doe' };
}

export async function POST(req: NextRequest) {
    const authenticatedUser = await getAuthenticatedUser(req);

    // Si no hay un usuario autenticado, denegar el acceso.
    if (!authenticatedUser) {
        return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await req.json();
    const { userId } = body; // El ID del usuario que se está intentando modificar o acceder.

    // --- CORRECCIÓN DE SEGURIDAD ---
    // Aquí está la validación que Vercel recomienda.
    // Comprueba que el usuario autenticado es el mismo que el que se está intentando afectar.
    if (authenticatedUser.id !== userId) {
        return NextResponse.json(
            { error: 'Unauthorized' },
            { status: 403 } // 403 Forbidden es más apropiado que 401 Unauthorized aquí.
        );
    }

    // --- LÓGICA DEL CHAT ---
    // Si la validación es correcta, aquí puedes continuar con la lógica de tu chat.
    // Por ejemplo, guardar un mensaje en la base de datos.

    console.log(`User ${authenticatedUser.id} is performing an action.`);

    return NextResponse.json({ success: true, message: 'Action completed successfully.' });
}
