'use server';
import { redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { categories, CONTACT_KINDS, contactMethods, photos, profiles } from '@/db/schema';
import { requireUser } from '@/lib/auth';
import { ImageRejected, MAX_UPLOAD_BYTES, processProfilePhoto } from '@/lib/images';
import { hit } from '@/lib/rate-limit';
import { formObject, profileSchema } from '@/lib/validation';

export async function saveProfileAction(formData: FormData) {
  const { user, db } = await requireUser();
  const parsed = profileSchema.safeParse(formObject(formData));
  if (!parsed.success) redirect('/profile?notice=invalid');
  const d = parsed.data;
  await db(async (tx) => {
    let categoryId = d.categoryId;
    if (categoryId) {
      const [c] = await tx.select({ id: categories.id }).from(categories).where(and(eq(categories.id, categoryId), eq(categories.active, true)));
      categoryId = c?.id ?? null;
    }
    const values = {
      displayName: d.displayName, businessName: d.businessName, categoryId, description: d.description,
      services: d.services, serviceArea: d.serviceArea, contactNote: d.contactNote, updatedAt: new Date(),
    };
    await tx.insert(profiles).values({ userId: user.userId, ...values })
      .onConflictDoUpdate({ target: profiles.userId, set: values });
    for (const kind of CONTACT_KINDS) {
      const c = d[kind];
      if (c.value) {
        await tx.insert(contactMethods).values({ userId: user.userId, kind, value: c.value, visible: c.visible })
          .onConflictDoUpdate({ target: [contactMethods.userId, contactMethods.kind], set: { value: c.value, visible: c.visible } });
      } else {
        await tx.delete(contactMethods).where(and(eq(contactMethods.userId, user.userId), eq(contactMethods.kind, kind)));
      }
    }
  });
  redirect('/profile?notice=saved');
}

export async function uploadPhotoAction(formData: FormData) {
  const { user, db } = await requireUser();
  if (!(await hit('uploadsPerHour', user.userId))) redirect('/profile?notice=rate_limited');
  const file = formData.get('photo');
  if (!(file instanceof File) || file.size === 0 || file.size > MAX_UPLOAD_BYTES) redirect('/profile?notice=photo_rejected');
  let data: Buffer;
  try {
    data = await processProfilePhoto(Buffer.from(await file.arrayBuffer()));
  } catch (e) {
    if (e instanceof ImageRejected) redirect('/profile?notice=photo_rejected');
    throw e;
  }
  await db((tx) => tx.insert(photos).values({ userId: user.userId, data })
    .onConflictDoUpdate({ target: photos.userId, set: { data, updatedAt: new Date() } }));
  redirect('/profile?notice=saved');
}

export async function removePhotoAction() {
  const { user, db } = await requireUser();
  await db((tx) => tx.delete(photos).where(eq(photos.userId, user.userId)));
  redirect('/profile?notice=photo_removed');
}
