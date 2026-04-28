// Curated baseline incident lists for cloud providers that don't expose paginated
// historical APIs (AWS, Azure, DigitalOcean, Oracle Cloud). Sourced from the
// jsinfo-ui *-simulated-incidents.json datasets on 2026-04-28. Update when major
// outages occur on these providers.

export interface BaselineIncident {
  provider: string;
  name: string;
  date: string;
  timestamp: string;
  impact: string;
  status?: string;
  description?: string;
}

export const AWS_BASELINE: BaselineIncident[] = [
  {
    "provider": "AWS",
    "name": "EC2 Performance Issues - US-EAST-1",
    "date": "2025-12-18",
    "timestamp": "2025-12-18T08:00:00Z",
    "impact": "minor",
    "status": "resolved",
    "description": "Increased latency and intermittent errors for EC2 in US-EAST-1 region"
  },
  {
    "provider": "AWS",
    "name": "S3 Performance Issues - US-WEST-2",
    "date": "2025-12-05",
    "timestamp": "2025-12-05T09:07:00Z",
    "impact": "minor",
    "status": "resolved",
    "description": "Increased latency and intermittent errors for S3 in US-WEST-2 region"
  },
  {
    "provider": "AWS",
    "name": "RDS Performance Issues - EU-WEST-1",
    "date": "2025-11-28",
    "timestamp": "2025-11-28T10:14:00Z",
    "impact": "minor",
    "status": "resolved",
    "description": "Increased latency and intermittent errors for RDS in EU-WEST-1 region"
  },
  {
    "provider": "AWS",
    "name": "Lambda Performance Issues - EU-CENTRAL-1",
    "date": "2025-11-15",
    "timestamp": "2025-11-15T11:21:00Z",
    "impact": "minor",
    "status": "resolved",
    "description": "Increased latency and intermittent errors for Lambda in EU-CENTRAL-1 region"
  },
  {
    "provider": "AWS",
    "name": "DynamoDB Service Disruption - AP-SOUTHEAST-1",
    "date": "2025-11-02",
    "timestamp": "2025-11-02T12:28:00Z",
    "impact": "major",
    "status": "resolved",
    "description": "Elevated error rates and service unavailability for DynamoDB in AP-SOUTHEAST-1 region"
  },
  {
    "provider": "AWS",
    "name": "CloudFront Performance Issues - AP-NORTHEAST-1",
    "date": "2025-10-22",
    "timestamp": "2025-10-22T13:35:00Z",
    "impact": "minor",
    "status": "resolved",
    "description": "Increased latency and intermittent errors for CloudFront in AP-NORTHEAST-1 region"
  },
  {
    "provider": "AWS",
    "name": "Route53 Performance Issues - US-EAST-1",
    "date": "2025-10-10",
    "timestamp": "2025-10-10T14:42:00Z",
    "impact": "minor",
    "status": "resolved",
    "description": "Increased latency and intermittent errors for Route53 in US-EAST-1 region"
  },
  {
    "provider": "AWS",
    "name": "ECS Performance Issues - US-WEST-2",
    "date": "2025-10-01",
    "timestamp": "2025-10-01T15:49:00Z",
    "impact": "minor",
    "status": "resolved",
    "description": "Increased latency and intermittent errors for ECS in US-WEST-2 region"
  },
  {
    "provider": "AWS",
    "name": "EKS Performance Issues - EU-WEST-1",
    "date": "2025-09-20",
    "timestamp": "2025-09-20T16:56:00Z",
    "impact": "minor",
    "status": "resolved",
    "description": "Increased latency and intermittent errors for EKS in EU-WEST-1 region"
  },
  {
    "provider": "AWS",
    "name": "API Gateway Service Disruption - EU-CENTRAL-1",
    "date": "2025-09-08",
    "timestamp": "2025-09-08T17:03:00Z",
    "impact": "major",
    "status": "resolved",
    "description": "Elevated error rates and service unavailability for API Gateway in EU-CENTRAL-1 region"
  },
  {
    "provider": "AWS",
    "name": "EC2 Performance Issues - AP-SOUTHEAST-1",
    "date": "2025-08-25",
    "timestamp": "2025-08-25T18:10:00Z",
    "impact": "minor",
    "status": "resolved",
    "description": "Increased latency and intermittent errors for EC2 in AP-SOUTHEAST-1 region"
  },
  {
    "provider": "AWS",
    "name": "S3 Performance Issues - AP-NORTHEAST-1",
    "date": "2025-08-12",
    "timestamp": "2025-08-12T19:17:00Z",
    "impact": "minor",
    "status": "resolved",
    "description": "Increased latency and intermittent errors for S3 in AP-NORTHEAST-1 region"
  },
  {
    "provider": "AWS",
    "name": "RDS Performance Issues - US-EAST-1",
    "date": "2025-07-30",
    "timestamp": "2025-07-30T08:24:00Z",
    "impact": "minor",
    "status": "resolved",
    "description": "Increased latency and intermittent errors for RDS in US-EAST-1 region"
  },
  {
    "provider": "AWS",
    "name": "Lambda Performance Issues - US-WEST-2",
    "date": "2025-07-18",
    "timestamp": "2025-07-18T09:31:00Z",
    "impact": "minor",
    "status": "resolved",
    "description": "Increased latency and intermittent errors for Lambda in US-WEST-2 region"
  },
  {
    "provider": "AWS",
    "name": "DynamoDB Service Disruption - EU-WEST-1",
    "date": "2025-07-05",
    "timestamp": "2025-07-05T10:38:00Z",
    "impact": "major",
    "status": "resolved",
    "description": "Elevated error rates and service unavailability for DynamoDB in EU-WEST-1 region"
  },
  {
    "provider": "AWS",
    "name": "CloudFront Performance Issues - EU-CENTRAL-1",
    "date": "2025-06-22",
    "timestamp": "2025-06-22T11:45:00Z",
    "impact": "minor",
    "status": "resolved",
    "description": "Increased latency and intermittent errors for CloudFront in EU-CENTRAL-1 region"
  },
  {
    "provider": "AWS",
    "name": "Route53 Performance Issues - AP-SOUTHEAST-1",
    "date": "2025-06-10",
    "timestamp": "2025-06-10T12:52:00Z",
    "impact": "minor",
    "status": "resolved",
    "description": "Increased latency and intermittent errors for Route53 in AP-SOUTHEAST-1 region"
  },
  {
    "provider": "AWS",
    "name": "ECS Performance Issues - AP-NORTHEAST-1",
    "date": "2025-05-28",
    "timestamp": "2025-05-28T13:59:00Z",
    "impact": "minor",
    "status": "resolved",
    "description": "Increased latency and intermittent errors for ECS in AP-NORTHEAST-1 region"
  },
  {
    "provider": "AWS",
    "name": "EKS Performance Issues - US-EAST-1",
    "date": "2025-05-15",
    "timestamp": "2025-05-15T14:06:00Z",
    "impact": "minor",
    "status": "resolved",
    "description": "Increased latency and intermittent errors for EKS in US-EAST-1 region"
  },
  {
    "provider": "AWS",
    "name": "API Gateway Service Disruption - US-WEST-2",
    "date": "2025-05-02",
    "timestamp": "2025-05-02T15:13:00Z",
    "impact": "major",
    "status": "resolved",
    "description": "Elevated error rates and service unavailability for API Gateway in US-WEST-2 region"
  },
  {
    "provider": "AWS",
    "name": "EC2 Performance Issues - EU-WEST-1",
    "date": "2025-04-20",
    "timestamp": "2025-04-20T16:20:00Z",
    "impact": "minor",
    "status": "resolved",
    "description": "Increased latency and intermittent errors for EC2 in EU-WEST-1 region"
  },
  {
    "provider": "AWS",
    "name": "S3 Performance Issues - EU-CENTRAL-1",
    "date": "2025-04-08",
    "timestamp": "2025-04-08T17:27:00Z",
    "impact": "minor",
    "status": "resolved",
    "description": "Increased latency and intermittent errors for S3 in EU-CENTRAL-1 region"
  },
  {
    "provider": "AWS",
    "name": "RDS Performance Issues - AP-SOUTHEAST-1",
    "date": "2025-03-25",
    "timestamp": "2025-03-25T18:34:00Z",
    "impact": "minor",
    "status": "resolved",
    "description": "Increased latency and intermittent errors for RDS in AP-SOUTHEAST-1 region"
  },
  {
    "provider": "AWS",
    "name": "Lambda Performance Issues - AP-NORTHEAST-1",
    "date": "2025-03-12",
    "timestamp": "2025-03-12T19:41:00Z",
    "impact": "minor",
    "status": "resolved",
    "description": "Increased latency and intermittent errors for Lambda in AP-NORTHEAST-1 region"
  },
  {
    "provider": "AWS",
    "name": "DynamoDB Service Disruption - US-EAST-1",
    "date": "2025-03-01",
    "timestamp": "2025-03-01T08:48:00Z",
    "impact": "major",
    "status": "resolved",
    "description": "Elevated error rates and service unavailability for DynamoDB in US-EAST-1 region"
  },
  {
    "provider": "AWS",
    "name": "CloudFront Performance Issues - US-WEST-2",
    "date": "2025-02-18",
    "timestamp": "2025-02-18T09:55:00Z",
    "impact": "minor",
    "status": "resolved",
    "description": "Increased latency and intermittent errors for CloudFront in US-WEST-2 region"
  },
  {
    "provider": "AWS",
    "name": "Route53 Performance Issues - EU-WEST-1",
    "date": "2025-02-05",
    "timestamp": "2025-02-05T10:02:00Z",
    "impact": "minor",
    "status": "resolved",
    "description": "Increased latency and intermittent errors for Route53 in EU-WEST-1 region"
  },
  {
    "provider": "AWS",
    "name": "ECS Performance Issues - EU-CENTRAL-1",
    "date": "2025-01-22",
    "timestamp": "2025-01-22T11:09:00Z",
    "impact": "minor",
    "status": "resolved",
    "description": "Increased latency and intermittent errors for ECS in EU-CENTRAL-1 region"
  },
  {
    "provider": "AWS",
    "name": "EKS Performance Issues - AP-SOUTHEAST-1",
    "date": "2025-01-10",
    "timestamp": "2025-01-10T12:16:00Z",
    "impact": "minor",
    "status": "resolved",
    "description": "Increased latency and intermittent errors for EKS in AP-SOUTHEAST-1 region"
  },
  {
    "provider": "AWS",
    "name": "API Gateway Service Disruption - AP-NORTHEAST-1",
    "date": "2025-01-03",
    "timestamp": "2025-01-03T13:23:00Z",
    "impact": "major",
    "status": "resolved",
    "description": "Elevated error rates and service unavailability for API Gateway in AP-NORTHEAST-1 region"
  }
];

export const AZURE_BASELINE: BaselineIncident[] = [
  {
    "provider": "Azure",
    "name": "Virtual Machines - Degraded Performance",
    "date": "2025-12-12",
    "timestamp": "2025-12-12T10:00:00Z",
    "impact": "minor",
    "status": "resolved",
    "description": "Performance degradation affecting Virtual Machines in West Europe"
  },
  {
    "provider": "Azure",
    "name": "Storage - Degraded Performance",
    "date": "2025-11-20",
    "timestamp": "2025-11-20T11:11:00Z",
    "impact": "minor",
    "status": "resolved",
    "description": "Performance degradation affecting Storage in North Europe"
  },
  {
    "provider": "Azure",
    "name": "Azure AD - Degraded Performance",
    "date": "2025-11-05",
    "timestamp": "2025-11-05T12:22:00Z",
    "impact": "minor",
    "status": "resolved",
    "description": "Performance degradation affecting Azure AD in East US"
  },
  {
    "provider": "Azure",
    "name": "App Service - Service Outage",
    "date": "2025-10-28",
    "timestamp": "2025-10-28T13:33:00Z",
    "impact": "major",
    "status": "resolved",
    "description": "Service unavailability affecting App Service in West US 2"
  },
  {
    "provider": "Azure",
    "name": "Cosmos DB - Degraded Performance",
    "date": "2025-10-15",
    "timestamp": "2025-10-15T14:44:00Z",
    "impact": "minor",
    "status": "resolved",
    "description": "Performance degradation affecting Cosmos DB in Southeast Asia"
  },
  {
    "provider": "Azure",
    "name": "Functions - Degraded Performance",
    "date": "2025-10-05",
    "timestamp": "2025-10-05T15:55:00Z",
    "impact": "minor",
    "status": "resolved",
    "description": "Performance degradation affecting Functions in West Europe"
  },
  {
    "provider": "Azure",
    "name": "SQL Database - Degraded Performance",
    "date": "2025-09-18",
    "timestamp": "2025-09-18T16:06:00Z",
    "impact": "minor",
    "status": "resolved",
    "description": "Performance degradation affecting SQL Database in North Europe"
  },
  {
    "provider": "Azure",
    "name": "Container Instances - Service Outage",
    "date": "2025-09-02",
    "timestamp": "2025-09-02T17:17:00Z",
    "impact": "major",
    "status": "resolved",
    "description": "Service unavailability affecting Container Instances in East US"
  },
  {
    "provider": "Azure",
    "name": "Virtual Machines - Degraded Performance",
    "date": "2025-08-20",
    "timestamp": "2025-08-20T18:28:00Z",
    "impact": "minor",
    "status": "resolved",
    "description": "Performance degradation affecting Virtual Machines in West US 2"
  },
  {
    "provider": "Azure",
    "name": "Storage - Degraded Performance",
    "date": "2025-08-05",
    "timestamp": "2025-08-05T19:39:00Z",
    "impact": "minor",
    "status": "resolved",
    "description": "Performance degradation affecting Storage in Southeast Asia"
  },
  {
    "provider": "Azure",
    "name": "Azure AD - Degraded Performance",
    "date": "2025-07-22",
    "timestamp": "2025-07-22T10:50:00Z",
    "impact": "minor",
    "status": "resolved",
    "description": "Performance degradation affecting Azure AD in West Europe"
  },
  {
    "provider": "Azure",
    "name": "App Service - Service Outage",
    "date": "2025-07-08",
    "timestamp": "2025-07-08T11:01:00Z",
    "impact": "major",
    "status": "resolved",
    "description": "Service unavailability affecting App Service in North Europe"
  },
  {
    "provider": "Azure",
    "name": "Cosmos DB - Degraded Performance",
    "date": "2025-06-25",
    "timestamp": "2025-06-25T12:12:00Z",
    "impact": "minor",
    "status": "resolved",
    "description": "Performance degradation affecting Cosmos DB in East US"
  },
  {
    "provider": "Azure",
    "name": "Functions - Degraded Performance",
    "date": "2025-06-12",
    "timestamp": "2025-06-12T13:23:00Z",
    "impact": "minor",
    "status": "resolved",
    "description": "Performance degradation affecting Functions in West US 2"
  },
  {
    "provider": "Azure",
    "name": "SQL Database - Degraded Performance",
    "date": "2025-05-25",
    "timestamp": "2025-05-25T14:34:00Z",
    "impact": "minor",
    "status": "resolved",
    "description": "Performance degradation affecting SQL Database in Southeast Asia"
  },
  {
    "provider": "Azure",
    "name": "Container Instances - Service Outage",
    "date": "2025-05-10",
    "timestamp": "2025-05-10T15:45:00Z",
    "impact": "major",
    "status": "resolved",
    "description": "Service unavailability affecting Container Instances in West Europe"
  },
  {
    "provider": "Azure",
    "name": "Virtual Machines - Degraded Performance",
    "date": "2025-04-22",
    "timestamp": "2025-04-22T16:56:00Z",
    "impact": "minor",
    "status": "resolved",
    "description": "Performance degradation affecting Virtual Machines in North Europe"
  },
  {
    "provider": "Azure",
    "name": "Storage - Degraded Performance",
    "date": "2025-04-05",
    "timestamp": "2025-04-05T17:07:00Z",
    "impact": "minor",
    "status": "resolved",
    "description": "Performance degradation affecting Storage in East US"
  },
  {
    "provider": "Azure",
    "name": "Azure AD - Degraded Performance",
    "date": "2025-03-20",
    "timestamp": "2025-03-20T18:18:00Z",
    "impact": "minor",
    "status": "resolved",
    "description": "Performance degradation affecting Azure AD in West US 2"
  },
  {
    "provider": "Azure",
    "name": "App Service - Service Outage",
    "date": "2025-03-05",
    "timestamp": "2025-03-05T19:29:00Z",
    "impact": "major",
    "status": "resolved",
    "description": "Service unavailability affecting App Service in Southeast Asia"
  },
  {
    "provider": "Azure",
    "name": "Cosmos DB - Degraded Performance",
    "date": "2025-02-20",
    "timestamp": "2025-02-20T10:40:00Z",
    "impact": "minor",
    "status": "resolved",
    "description": "Performance degradation affecting Cosmos DB in West Europe"
  },
  {
    "provider": "Azure",
    "name": "Functions - Degraded Performance",
    "date": "2025-02-08",
    "timestamp": "2025-02-08T11:51:00Z",
    "impact": "minor",
    "status": "resolved",
    "description": "Performance degradation affecting Functions in North Europe"
  },
  {
    "provider": "Azure",
    "name": "SQL Database - Degraded Performance",
    "date": "2025-01-18",
    "timestamp": "2025-01-18T12:02:00Z",
    "impact": "minor",
    "status": "resolved",
    "description": "Performance degradation affecting SQL Database in East US"
  },
  {
    "provider": "Azure",
    "name": "Container Instances - Service Outage",
    "date": "2025-01-05",
    "timestamp": "2025-01-05T13:13:00Z",
    "impact": "major",
    "status": "resolved",
    "description": "Service unavailability affecting Container Instances in West US 2"
  }
];

export const DIGITALOCEAN_BASELINE: BaselineIncident[] = [
  {
    "provider": "DigitalOcean",
    "name": "Droplets Issues - NYC1",
    "date": "2025-12-08",
    "timestamp": "2025-12-08T09:00:00Z",
    "impact": "minor",
    "status": "resolved",
    "description": "Performance issues affecting Droplets in NYC1 region"
  },
  {
    "provider": "DigitalOcean",
    "name": "Load Balancers Issues - NYC3",
    "date": "2025-11-12",
    "timestamp": "2025-11-12T10:13:00Z",
    "impact": "minor",
    "status": "resolved",
    "description": "Performance issues affecting Load Balancers in NYC3 region"
  },
  {
    "provider": "DigitalOcean",
    "name": "Managed Databases Issues - SFO3",
    "date": "2025-10-20",
    "timestamp": "2025-10-20T11:26:00Z",
    "impact": "minor",
    "status": "resolved",
    "description": "Performance issues affecting Managed Databases in SFO3 region"
  },
  {
    "provider": "DigitalOcean",
    "name": "Kubernetes Issues - LON1",
    "date": "2025-10-02",
    "timestamp": "2025-10-02T12:39:00Z",
    "impact": "minor",
    "status": "resolved",
    "description": "Performance issues affecting Kubernetes in LON1 region"
  },
  {
    "provider": "DigitalOcean",
    "name": "Spaces Issues - AMS3",
    "date": "2025-09-15",
    "timestamp": "2025-09-15T13:52:00Z",
    "impact": "minor",
    "status": "resolved",
    "description": "Performance issues affecting Spaces in AMS3 region"
  },
  {
    "provider": "DigitalOcean",
    "name": "Droplets Issues - SGP1",
    "date": "2025-08-28",
    "timestamp": "2025-08-28T14:05:00Z",
    "impact": "minor",
    "status": "resolved",
    "description": "Performance issues affecting Droplets in SGP1 region"
  },
  {
    "provider": "DigitalOcean",
    "name": "Load Balancers Issues - NYC1",
    "date": "2025-08-10",
    "timestamp": "2025-08-10T15:18:00Z",
    "impact": "minor",
    "status": "resolved",
    "description": "Performance issues affecting Load Balancers in NYC1 region"
  },
  {
    "provider": "DigitalOcean",
    "name": "Managed Databases Issues - NYC3",
    "date": "2025-07-25",
    "timestamp": "2025-07-25T16:31:00Z",
    "impact": "minor",
    "status": "resolved",
    "description": "Performance issues affecting Managed Databases in NYC3 region"
  },
  {
    "provider": "DigitalOcean",
    "name": "Kubernetes Issues - SFO3",
    "date": "2025-07-08",
    "timestamp": "2025-07-08T09:44:00Z",
    "impact": "minor",
    "status": "resolved",
    "description": "Performance issues affecting Kubernetes in SFO3 region"
  },
  {
    "provider": "DigitalOcean",
    "name": "Spaces Issues - LON1",
    "date": "2025-06-18",
    "timestamp": "2025-06-18T10:57:00Z",
    "impact": "minor",
    "status": "resolved",
    "description": "Performance issues affecting Spaces in LON1 region"
  },
  {
    "provider": "DigitalOcean",
    "name": "Droplets Issues - AMS3",
    "date": "2025-05-30",
    "timestamp": "2025-05-30T11:10:00Z",
    "impact": "minor",
    "status": "resolved",
    "description": "Performance issues affecting Droplets in AMS3 region"
  },
  {
    "provider": "DigitalOcean",
    "name": "Load Balancers Issues - SGP1",
    "date": "2025-05-12",
    "timestamp": "2025-05-12T12:23:00Z",
    "impact": "minor",
    "status": "resolved",
    "description": "Performance issues affecting Load Balancers in SGP1 region"
  },
  {
    "provider": "DigitalOcean",
    "name": "Managed Databases Issues - NYC1",
    "date": "2025-04-25",
    "timestamp": "2025-04-25T13:36:00Z",
    "impact": "minor",
    "status": "resolved",
    "description": "Performance issues affecting Managed Databases in NYC1 region"
  },
  {
    "provider": "DigitalOcean",
    "name": "Kubernetes Issues - NYC3",
    "date": "2025-04-08",
    "timestamp": "2025-04-08T14:49:00Z",
    "impact": "minor",
    "status": "resolved",
    "description": "Performance issues affecting Kubernetes in NYC3 region"
  },
  {
    "provider": "DigitalOcean",
    "name": "Spaces Issues - SFO3",
    "date": "2025-03-18",
    "timestamp": "2025-03-18T15:02:00Z",
    "impact": "minor",
    "status": "resolved",
    "description": "Performance issues affecting Spaces in SFO3 region"
  },
  {
    "provider": "DigitalOcean",
    "name": "Droplets Issues - LON1",
    "date": "2025-02-28",
    "timestamp": "2025-02-28T16:15:00Z",
    "impact": "minor",
    "status": "resolved",
    "description": "Performance issues affecting Droplets in LON1 region"
  },
  {
    "provider": "DigitalOcean",
    "name": "Load Balancers Issues - AMS3",
    "date": "2025-02-10",
    "timestamp": "2025-02-10T09:28:00Z",
    "impact": "minor",
    "status": "resolved",
    "description": "Performance issues affecting Load Balancers in AMS3 region"
  },
  {
    "provider": "DigitalOcean",
    "name": "Managed Databases Issues - SGP1",
    "date": "2025-01-15",
    "timestamp": "2025-01-15T10:41:00Z",
    "impact": "minor",
    "status": "resolved",
    "description": "Performance issues affecting Managed Databases in SGP1 region"
  }
];

export const ORACLE_BASELINE: BaselineIncident[] = [
  {
    "provider": "Oracle Cloud",
    "name": "Compute Performance Degradation",
    "date": "2025-12-02",
    "timestamp": "2025-12-02T11:00:00Z",
    "impact": "minor",
    "status": "resolved",
    "description": "Elevated latency for Compute services in US-ASHBURN-1"
  },
  {
    "provider": "Oracle Cloud",
    "name": "Object Storage Performance Degradation",
    "date": "2025-11-08",
    "timestamp": "2025-11-08T12:17:00Z",
    "impact": "minor",
    "status": "resolved",
    "description": "Elevated latency for Object Storage services in US-PHOENIX-1"
  },
  {
    "provider": "Oracle Cloud",
    "name": "Database Performance Degradation",
    "date": "2025-10-12",
    "timestamp": "2025-10-12T13:34:00Z",
    "impact": "minor",
    "status": "resolved",
    "description": "Elevated latency for Database services in EU-FRANKFURT-1"
  },
  {
    "provider": "Oracle Cloud",
    "name": "Networking Performance Degradation",
    "date": "2025-09-10",
    "timestamp": "2025-09-10T14:51:00Z",
    "impact": "minor",
    "status": "resolved",
    "description": "Elevated latency for Networking services in UK-LONDON-1"
  },
  {
    "provider": "Oracle Cloud",
    "name": "Container Engine Performance Degradation",
    "date": "2025-08-15",
    "timestamp": "2025-08-15T15:08:00Z",
    "impact": "minor",
    "status": "resolved",
    "description": "Elevated latency for Container Engine services in AP-TOKYO-1"
  },
  {
    "provider": "Oracle Cloud",
    "name": "Compute Performance Degradation",
    "date": "2025-07-12",
    "timestamp": "2025-07-12T16:25:00Z",
    "impact": "minor",
    "status": "resolved",
    "description": "Elevated latency for Compute services in US-ASHBURN-1"
  },
  {
    "provider": "Oracle Cloud",
    "name": "Object Storage Performance Degradation",
    "date": "2025-06-08",
    "timestamp": "2025-06-08T11:42:00Z",
    "impact": "minor",
    "status": "resolved",
    "description": "Elevated latency for Object Storage services in US-PHOENIX-1"
  },
  {
    "provider": "Oracle Cloud",
    "name": "Database Performance Degradation",
    "date": "2025-05-18",
    "timestamp": "2025-05-18T12:59:00Z",
    "impact": "minor",
    "status": "resolved",
    "description": "Elevated latency for Database services in EU-FRANKFURT-1"
  },
  {
    "provider": "Oracle Cloud",
    "name": "Networking Performance Degradation",
    "date": "2025-04-15",
    "timestamp": "2025-04-15T13:16:00Z",
    "impact": "minor",
    "status": "resolved",
    "description": "Elevated latency for Networking services in UK-LONDON-1"
  },
  {
    "provider": "Oracle Cloud",
    "name": "Container Engine Performance Degradation",
    "date": "2025-03-10",
    "timestamp": "2025-03-10T14:33:00Z",
    "impact": "minor",
    "status": "resolved",
    "description": "Elevated latency for Container Engine services in AP-TOKYO-1"
  },
  {
    "provider": "Oracle Cloud",
    "name": "Compute Performance Degradation",
    "date": "2025-02-15",
    "timestamp": "2025-02-15T15:50:00Z",
    "impact": "minor",
    "status": "resolved",
    "description": "Elevated latency for Compute services in US-ASHBURN-1"
  },
  {
    "provider": "Oracle Cloud",
    "name": "Object Storage Performance Degradation",
    "date": "2025-01-12",
    "timestamp": "2025-01-12T16:07:00Z",
    "impact": "minor",
    "status": "resolved",
    "description": "Elevated latency for Object Storage services in US-PHOENIX-1"
  }
];
