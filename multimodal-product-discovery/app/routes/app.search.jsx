import {
  Box,
  Card,
  Layout,
  Link,
  List,
  Page,
  Text,
  BlockStack,
  useBreakpoints,
  InlineGrid,
  TextField,
  Divider,
  Button
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import{useState} from "react";
import {json} from "@remix-run/node";
import { useLoaderData,Form } from "@remix-run/react";
import db from "../db.server";
export async function loader() {
  // provides data to the component
  let search=await db.search.findFirst();
  console.log("search----->", search);
  return json(search)
}

export async function action({request}) { //if this action isn't returning anything after an action, it will show an error
    let values=await request.formData();
    values=Object.fromEntries(values); //the form does not return any object so convert them
    await db.search.upsert({
      where:{
        id:"1"
      },
      update:{
        id:"1",
        name:values.name,
        description:values.description
      },
      create:{
        id:"1",
        name:values.name,
        description:values.description
      }
    })
    return json(values)
  // updates persistent data
}
export default function AdditionalPage() {
    const settings=useLoaderData();
    const [formState, setFormState]=useState(settings);  
  return (
    <Page>
      <TitleBar title="Search Semantic" />
      <Layout>
        <Layout.Section>
          <Card>
             <BlockStack gap={{ xs: "800", sm: "400" }}>
        <InlineGrid columns={{ xs: "1fr", md: "2fr 5fr" }} gap="400">
          <Box
            as="section"
            paddingInlineStart={{ xs: 400, sm: 0 }}
            paddingInlineEnd={{ xs: 400, sm: 0 }}
          >
            <BlockStack gap="400">
              <Text as="h3" variant="headingMd">
                Search
              </Text>
              <Text as="p" variant="bodyMd">
               Enter your favourite product
              </Text>
            </BlockStack>
          </Box>
          <Card roundedAbove="sm">
             <Form method="POST">
            <BlockStack gap="400">
               
              <TextField label="Name" name="name" value={formState?.name} onChange={(value)=>setFormState({ ...formState, name: value})}/>
              <TextField label="Description" name="description" value={formState?.description} onChange={(value)=>setFormState({ ...formState, description: value})} />
                <Button submit={true}>SUbmit</Button>
                
            </BlockStack>
            </Form>
          </Card>
        </InlineGrid>
       
      </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

function Code({ children }) {
  return (
    <Box
      as="span"
      padding="025"
      paddingInlineStart="100"
      paddingInlineEnd="100"
      background="bg-surface-active"
      borderWidth="025"
      borderColor="border"
      borderRadius="100"
    >
      <code>{children}</code>
    </Box>
  );
}
