import { PrismaClient, Region } from '@prisma/client';
import slugify from 'slugify';

const prisma = new PrismaClient();

const BRANDS = [
  'Mercedes-Benz', 'Yamaha', 'Porsche', 'Librelato', 'New Holland', 'YTO', 'Omoda | Jaecoo', 'Smart', 'JAC Motors', 'NXBoats', 
  'Komatsu', 'Honda', 'Chrysler', 'Land Rover', 'Lexus', 'Chevrolet', 'Troller', 'Scania', 'Man', 'Kia', 
  'LS Tractor', 'Fever', 'DAF', 'Dodge', 'Neta Auto', 'Kawasaki', 'DYNAPAC', 'Ventura Adventure', 'Michigan', 'Horsch', 
  'Lifan', 'Guerra Implementos', 'Iveco', 'Honda Motos', 'Jeep', 'Ventura Electric', 'Volkswagen Caminhões e Ônibus', 'BYD', 'BMW', 
  'Ventura', 'Tesla', 'BMW Motorrad', 'Ventura Marine', 'CFMoto', 'Geely', 'KTM', 'Hyundai', 'Jaguar', 'Chery', 
  'Volvo', 'Toyota', 'Subaru', 'Ferrari', 'Triumph', 'Massey Ferguson', 'Dafra Motos', 'Ford', 'Harley Davidson', 'Ducati', 
  'Michelin', 'Suzuki Motos', 'Citroën', 'Peugeot', 'Royal Enfield', 'Chrysler Jeep Dodge Ram', 'Vespa', 'MINI', 'Suzuki', 
  'Mitsubishi', 'Nissan', 'Maserati', 'BRP', 'Renault', 'Ram', 'Rolls Royce', 'BAJAJ', 'Manitou', 'Volkswagen', 
  'Fiat', 'Lamborghini', 'BOMAG', 'GWM', 'Audi', 'LEAPMOTOR'
];

// const BRANDS = [
//   'Honda', 'Fiat'
// ]

const STATES = [
  { name: 'Rio Grande do Norte', code: 'RN', ibgeCode: 24, region: 'NORDESTE' },
  { name: 'Acre', code: 'AC', ibgeCode: 12, region: 'NORTE' },
  { name: 'Alagoas', code: 'AL', ibgeCode: 27, region: 'NORDESTE' },
  { name: 'Amapá', code: 'AP', ibgeCode: 16, region: 'NORTE' },
  { name: 'Amazonas', code: 'AM', ibgeCode: 13, region: 'NORTE' },
  { name: 'Bahia', code: 'BA', ibgeCode: 29, region: 'NORDESTE' },
  { name: 'Ceará', code: 'CE', ibgeCode: 23, region: 'NORDESTE' },
  { name: 'Distrito Federal', code: 'DF', ibgeCode: 53, region: 'CENTRO_OESTE' },
  { name: 'Espírito Santo', code: 'ES', ibgeCode: 32, region: 'SUDESTE' },
  { name: 'Goiás', code: 'GO', ibgeCode: 52, region: 'CENTRO_OESTE' },
  { name: 'Maranhão', code: 'MA', ibgeCode: 21, region: 'NORDESTE' },
  { name: 'Mato Grosso', code: 'MT', ibgeCode: 51, region: 'CENTRO_OESTE' },
  { name: 'Mato Grosso do Sul', code: 'MS', ibgeCode: 50, region: 'CENTRO_OESTE' },
  { name: 'Minas Gerais', code: 'MG', ibgeCode: 31, region: 'SUDESTE' },
  { name: 'Pará', code: 'PA', ibgeCode: 15, region: 'NORTE' },
  { name: 'Paraíba', code: 'PB', ibgeCode: 25, region: 'NORDESTE' },
  { name: 'Paraná', code: 'PR', ibgeCode: 41, region: 'SUL' },
  { name: 'Pernambuco', code: 'PE', ibgeCode: 26, region: 'NORDESTE' },
  { name: 'Piauí', code: 'PI', ibgeCode: 22, region: 'NORDESTE' },
  { name: 'Rio de Janeiro', code: 'RJ', ibgeCode: 33, region: 'SUDESTE' },
  { name: 'Rio Grande do Sul', code: 'RS', ibgeCode: 43, region: 'SUL' },
  { name: 'Rondônia', code: 'RO', ibgeCode: 11, region: 'NORTE' },
  { name: 'Roraima', code: 'RR', ibgeCode: 14, region: 'NORTE' },
  { name: 'Santa Catarina', code: 'SC', ibgeCode: 42, region: 'SUL' },
  { name: 'São Paulo', code: 'SP', ibgeCode: 35, region: 'SUDESTE' },
  { name: 'Sergipe', code: 'SE', ibgeCode: 28, region: 'NORDESTE' },
  { name: 'Tocantins', code: 'TO', ibgeCode: 17, region: 'NORTE' }
];

function createSlug(name: string): string {
  return slugify(name, {
    lower: true,
    strict: true,
    remove: /[*+~.()'"!:@]/g
  });
}

async function main() {
  console.log('Starting seed (upsert mode)...');

  try {
    console.log('Seeding brands...');
    await Promise.all(
      BRANDS.map(async (brandName) => {
        await prisma.brand.upsert({
          where: { name: brandName },
          update: {}, // Não atualiza nada se já existir
          create: {
            name: brandName,
            slug: createSlug(brandName),
          }
        });
      })
    );
    console.log(`Processed ${BRANDS.length} brands`);

    console.log('Seeding states...');
    await Promise.all(
      STATES.map(async (state) => {
        await prisma.state.upsert({
          where: { code: state.code },
          update: {}, // Não atualiza se já existir
          create: {
            name: state.name,
            code: state.code,
            ibgeCode: state.ibgeCode,
            region: state.region as Region,
          }
        });
      })
    );
    console.log(`Processed ${STATES.length} states`);

    console.log('Creating/checking default group...');
    const defaultGroup = await prisma.group.upsert({
      where: { slug: 'default' },
      update: {}, // Não atualiza se já existir
      create: {
        name: 'Default Group',
        slug: 'default',
        description: 'Default group for stores without specific group',
        isActive: true,
      }
    });
    console.log(`Default group: ${defaultGroup.name} (${defaultGroup.id})`);

    // Criar fornecedores básicos se não existirem
    console.log('Creating/checking website providers...');
    const providers = [
      { name: 'Desconhecido', slug: 'desconhecido' },
      { name: 'WordPress', slug: 'wordpress' },
      { name: 'Shopify', slug: 'shopify' },
      { name: 'Wix', slug: 'wix' },
      { name: 'AutoForce', slug: 'autoforce' },
      { name: 'DealerSpace', slug: 'dealerspace' },
      { name: 'Syonet', slug: 'syonet' },
      { name: 'Alpes One', slug: 'alpesone' },
      { name: 'Autoveiculos', slug: 'autoveiculo' },
      { name: 'Webmotors', slug: 'webmotors' },
      { name: 'revvotech', slug: 'revvotech' },
    ];

    for (const provider of providers) {
      await prisma.websiteProvider.upsert({
        where: { slug: provider.slug },
        update: {},
        create: {
          name: provider.name,
          slug: provider.slug,
        }
      });
    }
    console.log(`Processed ${providers.length} website providers`);

    console.log('Seed completed successfully!');
    console.log(`Summary:`);
    console.log(`  - Brands: ${BRANDS.length} processed`);
    console.log(`  - States: ${STATES.length} processed`);
    console.log(`  - Groups: 1 processed`);
    console.log(`  - Providers: ${providers.length} processed`);

  } catch (error) {
    console.error('Error during seed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });