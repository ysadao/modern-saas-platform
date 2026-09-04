import bcrypt from "bcryptjs";
import { PrismaClient, Role, ProjectStatus } from "@prisma/client";

const prisma = new PrismaClient();

const DEMO_EMAIL = "demo@harbor.app";
const DEMO_PASSWORD = "HarborDemo123!";

function rounds() {
  return Number(process.env.BCRYPT_ROUNDS ?? 10);
}

export async function seed() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, rounds());
  const now = new Date();

  const demo = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: {
      passwordHash,
      firstName: "Dana",
      lastName: "Harbor",
      emailVerifiedAt: now,
    },
    create: {
      email: DEMO_EMAIL,
      passwordHash,
      firstName: "Dana",
      lastName: "Harbor",
      emailVerifiedAt: now,
    },
  });

  const jordan = await prisma.user.upsert({
    where: { email: "jordan@northwind.labs" },
    update: { passwordHash, emailVerifiedAt: now },
    create: {
      email: "jordan@northwind.labs",
      passwordHash,
      firstName: "Jordan",
      lastName: "Pike",
      emailVerifiedAt: now,
    },
  });

  const priya = await prisma.user.upsert({
    where: { email: "priya@northwind.labs" },
    update: { passwordHash, emailVerifiedAt: now },
    create: {
      email: "priya@northwind.labs",
      passwordHash,
      firstName: "Priya",
      lastName: "Shah",
      emailVerifiedAt: now,
    },
  });

  const org = await prisma.organization.upsert({
    where: { slug: "northwind-labs" },
    update: { name: "Northwind Labs" },
    create: {
      name: "Northwind Labs",
      slug: "northwind-labs",
    },
  });

  await prisma.organizationMember.upsert({
    where: { userId_organizationId: { userId: demo.id, organizationId: org.id } },
    update: { role: Role.OWNER },
    create: { userId: demo.id, organizationId: org.id, role: Role.OWNER },
  });

  await prisma.organizationMember.upsert({
    where: { userId_organizationId: { userId: jordan.id, organizationId: org.id } },
    update: { role: Role.ADMIN },
    create: { userId: jordan.id, organizationId: org.id, role: Role.ADMIN },
  });

  await prisma.organizationMember.upsert({
    where: { userId_organizationId: { userId: priya.id, organizationId: org.id } },
    update: { role: Role.VIEWER },
    create: { userId: priya.id, organizationId: org.id, role: Role.VIEWER },
  });

  const billing = await prisma.project.findFirst({
    where: { organizationId: org.id, name: "Billing Pipeline" },
  });
  if (!billing) {
    await prisma.project.create({
      data: {
        organizationId: org.id,
        name: "Billing Pipeline",
        description: "Usage metering, invoices, and dunning for tenant workspaces.",
        status: ProjectStatus.ACTIVE,
      },
    });
  }

  const observability = await prisma.project.findFirst({
    where: { organizationId: org.id, name: "Observability Stack" },
  });
  if (!observability) {
    await prisma.project.create({
      data: {
        organizationId: org.id,
        name: "Observability Stack",
        description: "Traces, logs, and SLO burn alerts for the control plane.",
        status: ProjectStatus.ACTIVE,
      },
    });
  }

  const fleet = [
    { slug: "aperture-freight", name: "Aperture Freight", project: "Lane scoring" },
    { slug: "kestrel-audit", name: "Kestrel Audit", project: "Evidence locker" },
    { slug: "helios-payments", name: "Helios Payments", project: "Clearing adapter" },
    { slug: "meridian-cloud", name: "Meridian Cloud", project: "Cluster inventory" },
    { slug: "volt-robotics", name: "Volt Robotics", project: "Fleet telemetry" },
  ];
  for (const tenant of fleet) {
    const extra = await prisma.organization.upsert({
      where: { slug: tenant.slug },
      update: { name: tenant.name },
      create: { name: tenant.name, slug: tenant.slug },
    });
    await prisma.organizationMember.upsert({
      where: { userId_organizationId: { userId: demo.id, organizationId: extra.id } },
      update: { role: Role.OWNER },
      create: { userId: demo.id, organizationId: extra.id, role: Role.OWNER },
    });
    const hasProject = await prisma.project.findFirst({
      where: { organizationId: extra.id, name: tenant.project },
    });
    if (!hasProject) {
      await prisma.project.create({
        data: {
          organizationId: extra.id,
          name: tenant.project,
          description: `${tenant.project} for ${tenant.name}.`,
          status: ProjectStatus.ACTIVE,
        },
      });
    }
  }

  const existingAudit = await prisma.auditLog.count({ where: { organizationId: org.id } });
  if (existingAudit === 0) {
    await prisma.auditLog.createMany({
      data: [
        {
          userId: demo.id,
          organizationId: org.id,
          action: "organization.created",
          resource: "organization",
          resourceId: org.id,
          metadata: { name: org.name },
        },
        {
          userId: demo.id,
          organizationId: org.id,
          action: "member.invited",
          resource: "membership",
          resourceId: jordan.id,
          metadata: { email: jordan.email, role: "ADMIN" },
        },
        {
          userId: demo.id,
          organizationId: org.id,
          action: "member.invited",
          resource: "membership",
          resourceId: priya.id,
          metadata: { email: priya.email, role: "VIEWER" },
        },
        {
          userId: demo.id,
          organizationId: org.id,
          action: "project.created",
          resource: "project",
          metadata: { name: "Billing Pipeline" },
        },
        {
          userId: demo.id,
          organizationId: org.id,
          action: "project.created",
          resource: "project",
          metadata: { name: "Observability Stack" },
        },
      ],
    });
  }

  return { demo, org };
}

const isDirectRun = process.argv[1]?.includes("seed");
if (isDirectRun) {
  seed()
    .then(() => {
      console.log("Seeded demo@harbor.app / HarborDemo123! (Northwind Labs)");
    })
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
