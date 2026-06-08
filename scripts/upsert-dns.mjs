import {
  ChangeResourceRecordSetsCommand,
  ListResourceRecordSetsCommand,
  Route53Client,
} from "@aws-sdk/client-route-53";

const zoneId = process.env.HOSTED_ZONE_ID || "Z3FQ1J6D2XJRDT";
const domainName = process.env.DOMAIN_NAME || "chess.jrog.io";
const targetRaw = process.env.DNS_TARGET || "dev.jrog.io";

const domain = domainName.endsWith(".") ? domainName : `${domainName}.`;
const target = targetRaw.endsWith(".") ? targetRaw : `${targetRaw}.`;

const client = new Route53Client({ region: process.env.AWS_REGION || "us-west-2" });

const existing = await client.send(
  new ListResourceRecordSetsCommand({
    HostedZoneId: zoneId,
    StartRecordName: domain,
    StartRecordType: "CNAME",
    MaxItems: "1",
  }),
);

for (const rr of existing.ResourceRecordSets ?? []) {
  if (rr.Name === domain && rr.Type === "CNAME") {
    console.log(`Current CNAME: ${rr.ResourceRecords?.[0]?.Value}`);
  }
}

const resp = await client.send(
  new ChangeResourceRecordSetsCommand({
    HostedZoneId: zoneId,
    ChangeBatch: {
      Changes: [
        {
          Action: "UPSERT",
          ResourceRecordSet: {
            Name: domain,
            Type: "CNAME",
            TTL: 300,
            ResourceRecords: [{ Value: target }],
          },
        },
      ],
    },
  }),
);

console.log(`UPSERT ${domain} -> ${target}`);
console.log(`Change ID: ${resp.ChangeInfo?.Id}`);
console.log(`Status: ${resp.ChangeInfo?.Status}`);
