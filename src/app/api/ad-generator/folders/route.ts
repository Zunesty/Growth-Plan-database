const driveUrl = (id: string | undefined) =>
  id ? `https://drive.google.com/drive/folders/${id}` : null;

export async function GET() {
  return Response.json({
    bottles: driveUrl(process.env.DRIVE_BOTTLES_FOLDER_ID),
    output: driveUrl(process.env.DRIVE_OUTPUT_FOLDER_ID),
    approved: driveUrl(process.env.DRIVE_APPROVED_FOLDER_ID),
  });
}
